# Tenancy: `@TenantId`, native SQL, and `runAsBox`

BoxHub is single-schema, single-database multi-tenant. Tenant isolation for box-scoped tables is
enforced by Hibernate's `@TenantId` discriminator (ADR-001), not by application-level `WHERE
box_id = ?` clauses sprinkled through repositories. This document is the rule referenced from
`CLAUDE.md`'s tenancy section — read it before adding a repository method on a `@TenantId` entity.

## The rule

**Every derived or JPQL query Spring Data generates for a `@TenantId` entity is silently rewritten
to add `AND box_id = :currentTenant`.** The current tenant comes from
`TenantIdentifierResolver.resolveCurrentTenantIdentifier()`, which reads the `box_id` claim off
the JWT in `SecurityContextHolder` via `TenantContext.boxIdOrNull()`.

This is correct and desired for the 95% case: a request handler under `/api/box/**` runs with
`SCOPE_box` and a real `box_id` claim, so every derived query it triggers is automatically scoped
to the caller's own box. No repository method needs to say `AndBoxId` — that's the entire point of
discriminator multitenancy.

It becomes a trap for the other 5%: **any code path that is not itself a single box's authenticated
request** — a `@Scheduled` job, a `permitAll` webhook, a lookup by an unguessable token before the
caller has any box membership. That code has no JWT, or the wrong one, in the ambient
`SecurityContext`. Two distinct things can go wrong there, and they fail differently:

### Failure mode 1: silent-empty read (wrong ambient tenant)

If a derived/JPQL query on a `@TenantId` entity runs while the `SecurityContext` holds **some
other box's** authentication — e.g. a box admin has a live session cookie for Box A open in one
tab and clicks an invite link for Box B in another — the query is filtered to Box A. It does not
error. It returns zero rows, exactly as if the row didn't exist. Whatever code called it treats
"not found" as the normal case (404, `Optional.empty()`, null), so nothing looks wrong until
someone notices the feature just doesn't work for that caller.

This is not hypothetical: it shipped three times before this audit —
`InviteRepository#findByTokenHash`, `InviteRepository#burnIfUnaccepted` (a JPQL bulk `UPDATE`
silently burning zero rows), and `SubscriptionLapseJob`'s original derived-query sweep. See
`CLAUDE.md` / commit history for the fixes. **A fourth instance was found and fixed by this
audit**: `InvitePublicController#preview` read `Plan` (a `@TenantId` entity) via a plain
`findById` on a `permitAll` endpoint (`GET /api/invites/{token}`) with no `runAsBox` guard. A
caller already authenticated to a *different* box got `planName: null` in the preview response
instead of the real plan name — silent, wrong, exactly this failure mode. Fixed by wrapping the
lookup in `runAsBox(inv.getBoxId(), ...)`; regression test:
`InviteAcceptApiTest#previewResolvesPlanNameEvenUnderAForeignBoxAmbientTenant` (fails against the
un-wrapped `findById` — see git history on this file for the before/after).

If instead the `SecurityContext` has **no** authentication at all (truly anonymous, or a job
thread that never set one), `TenantIdentifierResolver` resolves to the `NO_TENANT` sentinel
(`00000000-0000-0000-0000-000000000000`) and reports it as the Hibernate "root" tenant via
`isRoot()`. Per Hibernate's own `@TenantId` semantics, `isRoot() == true` **disables** the filter
entirely rather than filtering to the literal sentinel value — so a genuinely tenant-less read
fails **open** (sees every box), not empty. This is pinned and asserted by
`TenantIdIsolationTest#nullTenantSessionIsRootAndSeesAllBoxes_pinnedFailOpenBehavior`. Two
consequences: (a) fail-open reads are why `BookingMaintenance`'s no-show sweep can run genuinely
tenant-less and still see every box's sessions/bookings — it relies on this behavior on purpose;
(b) fail-open is *itself* a hazard if it ever leaked into a request path with real output, which
is exactly why the controller boundary (`SCOPE_box` + `TenantContext.requireBoxId()`), not the ORM
filter, is BoxHub's actual isolation guarantee for real requests — see ADR-001.

**The fix for a method that must be tenant-agnostic (scheduler, webhook, unguessable-token
lookup):** make it `@Query(nativeQuery = true)`. Native SQL bypasses the `@TenantId` rewrite
entirely, so it sees exactly what its own `WHERE` clause says — no ambient-tenant dependency, no
silent filtering, no fail-open surprise either.

### Failure mode 2: FK-violating write (no tenant set before insert)

A system-level writer (scheduler, seeder, job) that persists a **new** `@TenantId` entity while
the ambient tenant is `NO_TENANT` gets that all-zeros UUID stamped into the row's `box_id` column
on insert. There is no `boxes` row with id `00000000-...`, so the insert throws a foreign-key
violation — loud, not silent, but only at the moment of the very first write, potentially deep
inside a batch job after partial work already happened.

**The fix:** establish a synthetic, box-scoped `Authentication` via `runAsBox(boxId, ...)` for
each box the job/writer needs to touch, so every entity it creates is stamped with that box's real
id.

## The `runAsBox` pattern

Every cross-box job that writes (or reads with a *specific* target box) follows the same shape,
implemented independently in `SessionGenerator`, `SubscriptionLapseJob`, `TvStreamService`,
`StripeWebhookController`, `InvitePublicController`, and `DevDataSeeder` (search `runAsBox` in
`backend/src/main/java`):

```java
private <T> T runAsBox(UUID boxId, Supplier<T> action) {
    Authentication prev = SecurityContextHolder.getContext().getAuthentication();
    try {
        Jwt jwt = Jwt.withTokenValue("system").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
        return action.get();
    } finally {
        SecurityContextHolder.getContext().setAuthentication(prev);
    }
}
```

**The ordering is load-bearing, not stylistic:** `runAsBox` must install the synthetic
`Authentication` **before** the Hibernate session/transaction for that unit of work opens.
Hibernate resolves and caches the current tenant identifier once, at session-open time. Setting
`TenantContext`'s ambient JWT *after* a session is already open (e.g. inside an already-running
`@Transactional` method) is a no-op — every query on that session keeps using whatever tenant was
resolved when it opened. This is why:

- `SessionGenerator.generateForBox` is deliberately **not** `@Transactional`: it calls `runAsBox`
  first, and only opens the transaction (via `TransactionTemplate`) *inside* the `runAsBox` block.
- `StripeWebhookController`/`SubscriptionLapseJob`/`TvStreamService` all nest
  `runAsBox(boxId, () -> tx.execute(...))` in that order, never the reverse.
- `InvitePublicController#accept` is explicitly **not** one `@Transactional` method spanning
  membership creation and subscription creation — the membership transaction commits under the
  accepting user's own (tenant-less) token, and only *then* does a fresh `runAsBox` + fresh
  transaction create the `Subscription` (itself `@TenantId`) under the box's real tenant. Doing
  both in one method would open a single session under the wrong identity for its entire life.

If you write a new cross-box job or writer: set the tenant, *then* open the transaction/session,
every time.

## Methods deliberately native, and why

| Repository method | Entity | Why native |
|---|---|---|
| `InviteRepository#findByTokenHash` | `Invite` | Looked up by unguessable token hash before the caller has any box membership — permitAll, no ambient tenant to filter by. |
| `InviteRepository#burnIfUnaccepted` | `Invite` | Bulk `UPDATE` on the same tenant-agnostic accept path; a JPQL bulk update on a `@TenantId` entity is filtered the same as a `SELECT` and would silently update 0 rows for a cross-box accept. |
| `PaymentRepository#findByStripeSessionId` | `Payment` | The Stripe webhook (`permitAll`, no JWT at all) resolves the target box **from this row's own `box_id` column** before establishing `runAsBox` — it is both the tenant-less lookup and the box-resolution step, so it must work with zero ambient tenant. |

That is the complete list of methods that bypass the `@TenantId` filter by design. Everything else
on a `@TenantId` entity is a plain derived/JPQL query and is correct as such **because** every
caller either runs inside a real box-scoped request (`SCOPE_box` + `TenantContext`) or explicitly
wraps the call in `runAsBox` first (see `SessionGenerator`, `SubscriptionLapseJob`,
`TvStreamService`/`TvStateService`, `StripeWebhookController`, `InvitePublicController`,
`DevDataSeeder`). `BookingMaintenance`'s no-show sweep is the one exception that reads
tenant-*less* on purpose, relying on the documented fail-open behavior to see every box; it never
writes a *new* `@TenantId` row (only flips `status` on already-loaded `Booking` entities, whose
`box_id` was set at their original insert and is never re-stamped on update), so it never hits
failure mode 2 either.

## Regression coverage

Any method on this page's native-query table, or any `runAsBox` cross-box job, has a test seeding
rows in **two** boxes and asserting the tenant-agnostic path sees/affects both — a single-box test
passes against a silently-broken derived-query version just as happily as against the real fix,
which is exactly how this bug shipped three times. See:

- `SubscriptionLapseTest` (`sweepAll` across two boxes in one run)
- `InviteAcceptApiTest#userWithActiveBoxTokenCanPreviewAndAcceptForeignBoxInvite` and
  `#previewResolvesPlanNameEvenUnderAForeignBoxAmbientTenant`
- `InviteAcceptApiTest#burnIsAtomicSingleUse`
- `StripeWebhookTest` (repoint/cross-plan cases exercising `findByStripeSessionId`)
- `TenantIdIsolationTest` (pins both the normal per-tenant filtering behavior and the
  fail-open-on-no-tenant behavior at the ORM level, independent of any controller)

When adding a new `@TenantId` entity or a new cross-box job, add the analogous two-box test before
trusting the classification.
