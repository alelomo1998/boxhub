# Tenancy: `@TenantId`, `runAsBox`, `runAsRoot`, and the boxless session

BoxHub is single-schema, single-database multi-tenant. Tenant isolation for box-scoped tables is
enforced by Hibernate's `@TenantId` discriminator (ADR-001), not by application-level `WHERE
box_id = ?` clauses sprinkled through repositories. This document is the rule referenced from
`CLAUDE.md`'s tenancy section — read it before adding a repository method on a `@TenantId` entity,
before writing any route that is not under `/api/box/**`, and before writing any scheduled job.

**M21 changed the default this document used to describe.** A tenant-less read used to fail **OPEN**
— it saw every box. It now fails **CLOSED** — it sees nothing. §2 says why, and what replaced it.

## 1. The rule

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
caller has any box membership, and now anything served to a **boxless session** (§4). That code has
no JWT, or the wrong one, in the ambient `SecurityContext`.

## 2. The two sentinels, and what a tenant-less read does now

`TenantIdentifierResolver` resolves one of three things:

| Ambient state | Resolves to | `isRoot()` | Effect on a `@TenantId` read |
|---|---|---|---|
| A JWT carrying `box_id` | that box's id | false | filtered to that box — the 95% case |
| Nothing, or a JWT with no `box_id` | `NO_TENANT` (all zeros) | **false** | filter ON with a value no `boxes` row carries → **empty** |
| Inside `TenantContext.runAsRoot` | `ROOT` (all `f`s) | true | filter OFF → **every box** |

**Before M21, `NO_TENANT` reported itself as root**, which per Hibernate's own `@TenantId` semantics
*disables* the filter rather than filtering to the sentinel — so a genuinely tenant-less read saw
every box. That was fail-open, and it was one URL prefix away from a leak:
`CookieBearerTokenResolver` hands the **box** token to `/api/box/**` and the **user** token to
everything else, and a user token carries no `box_id`. So any new route outside `/api/box/**` — a
directory, a public box page, anything M24 adds — would have read across all boxes on its first
accidental repository call, silently, with nothing in review to catch it.

Now that same mistake returns an empty result. That is a bug, not a breach, and it is the trade this
milestone deliberately took: **silent-empty rather than silent-everything.** It is not loud.
`resolveCurrentTenantIdentifier()` runs for *every* Hibernate session, including the many that touch
no `@TenantId` entity at all (login, register, `/api/me`, every `User`/`Box`/`Membership` read), and
it cannot see which entities a session will touch — so throwing there would break the application,
and throwing only for tenant-scoped entities needs a Hibernate event listener. That machinery was
judged out of proportion once the default is closed. `runAsRoot` is greppable, and that is the audit
surface.

### Failure mode 1: silent-empty read (wrong ambient tenant)

If a derived/JPQL query on a `@TenantId` entity runs while the `SecurityContext` holds **some
other box's** authentication — e.g. a box admin has a live session for Box A open in one tab and
clicks an invite link for Box B in another — the query is filtered to Box A. It does not error. It
returns zero rows, exactly as if the row didn't exist. Whatever called it treats "not found" as the
normal case (404, `Optional.empty()`, null), so nothing looks wrong until someone notices the
feature just doesn't work for that caller.

This is not hypothetical: it shipped three times before the M11 audit —
`InviteRepository#findByTokenHash`, `InviteRepository#burnIfUnaccepted` (a JPQL bulk `UPDATE`
silently burning zero rows), and `SubscriptionLapseJob`'s original derived-query sweep. **A fourth
was found by that audit**: `InvitePublicController#preview` read `Plan` via a plain `findById` on a
`permitAll` endpoint, so a caller authenticated to a *different* box got `planName: null` instead of
the real plan name. Fixed with `runAsBox(inv.getBoxId(), ...)`; regression test
`InviteAcceptApiTest#previewResolvesPlanNameEvenUnderAForeignBoxAmbientTenant`.

**Since M21 this failure mode also covers the no-authentication case**, which used to behave the
opposite way. A tenant-less read is now indistinguishable from a wrong-tenant one: both return
nothing.

**The fix, unchanged:** a method that must be tenant-agnostic (scheduler, webhook,
unguessable-token lookup) is `@Query(nativeQuery = true)`. Native SQL bypasses the `@TenantId`
rewrite entirely, so it sees exactly what its own `WHERE` says.

### Failure mode 2: FK-violating write (no tenant set before insert)

A system-level writer that persists a **new** `@TenantId` entity while the ambient tenant is
`NO_TENANT` gets the all-zeros UUID stamped into the row's `box_id` on insert. There is no `boxes`
row with that id, so the insert throws a foreign-key violation — loud, not silent, but only at the
first write, potentially deep inside a batch job after partial work.

Unchanged by M21, and **`ROOT` behaves the same way**: it is not a real box either, so an insert
inside `runAsRoot` dies on the same foreign key. That is deliberate —`runAsRoot` is a read tool, and
this is what stops it being used as a write one. Pinned by
`TenantIdIsolationTest#writingATenantEntityUnderRootFails`.

**The fix:** establish a real box via `runAsBox(boxId, ...)` for each box the job needs to write to,
so every entity it creates is stamped with that box's real id.

## 3. `runAsBox` and `runAsRoot`

Both live in `com.boxhub.shared.TenantContext`. Since M21 there is **one** implementation of each —
`runAsBox` used to be copy-pasted into seven classes.

```java
TenantContext.runAsBox(boxId, () -> …);   // Supplier<T> or Runnable — act as this box
TenantContext.runAsRoot(() -> …);          // Supplier<T> or Runnable — see every box
```

**The ordering is load-bearing, not stylistic.** Both must install their `Authentication` **before**
the Hibernate session/transaction for that unit of work opens. Hibernate resolves and caches the
current tenant identifier once, at session-open time. Establishing it *after* a session is already
open (e.g. inside an already-running `@Transactional` method) is a no-op — every query on that
session keeps the tenant resolved when it opened. This is why:

- `SessionGenerator.generateForBox` is deliberately **not** `@Transactional`: it calls `runAsBox`
  first and opens the transaction (via `TransactionTemplate`) *inside* that block.
- `StripeWebhookController` / `SubscriptionLapseJob` / `TvStreamService` all nest
  `runAsBox(boxId, () -> tx.execute(...))` in that order, never the reverse.
- `BookingMaintenance.nightlyNoShowSweep` wraps the **call** to `BookingService.sweepNoShows`, which
  is itself `@Transactional` — putting `runAsRoot` inside that method would do nothing.
- `InvitePublicController#accept` is explicitly **not** one `@Transactional` method spanning
  membership creation and subscription creation — the membership transaction commits under the
  accepting user's own (tenant-less) token, and only *then* does a fresh `runAsBox` + fresh
  transaction create the `Subscription` under the box's real tenant.

**Nesting:** a `runAsBox` inside a `runAsRoot` replaces the whole `Authentication` and restores it in
its own `finally`, so a real box always wins over root and root comes back on exit. That is a
property of `SecurityContextHolder`, not a flag anyone has to juggle. Pinned by
`TenantIdIsolationTest#runAsBoxInsideRunAsRootNarrowsToThatBoxAndRestoresRootOnExit`.

**`runAsRoot` grants database visibility, never authorisation.** The principal it installs carries
**no** authorities, so it cannot satisfy any `hasAuthority`/`hasRole` check. It is for platform jobs
and **never for a thread serving a user request** — a request has a caller whose authorisation is
knowable, so "see every box" is always the wrong tool there; the right one is
`runAsBox(theBoxTheyAskedFor)` plus a check that the box is theirs to see.

**The gate:**

```sh
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'   # must be empty
```

Its only caller today is `BookingMaintenance`.

## 4. The boxless session

A token with no `box_id` claim (`scope=user`) reaches `/api/me/**`, the authenticated `/api/auth/*`
routes, and `POST /api/invites/{token}/accept`. M22–M24 add a directory, a box public page and a
drop-in bought by a non-member. This is the contract for all of them.

**It may READ:**

1. its own account and its own memberships;
2. a **declared public projection** of any box — and that projection must come from one of exactly
   three places:
   - a table that is **not** `@TenantId` (the `Movement`/`Box`/`Membership` pattern: an explicit
     `where box_id is null or box_id = :box` predicate, written out);
   - a `runAsBox(targetBoxId, …)` block, where the target is resolved from the request and the
     tenant filter stays **on**, scoped to exactly that box;
   - a registered `@Query(nativeQuery = true)` method carrying its own `WHERE`, listed in §6.

   A plain derived or JPQL read of a `@TenantId` entity from a boxless path is a bug. Since M21 it
   returns empty rather than leaking, but it is still a bug — and the empty result is the symptom.

**It may WRITE:**

- its own account (`PATCH /api/me/password`, `POST /api/me/email`, `DELETE /api/me`, session
  revocation);
- **nothing else inside a box**, except routes on a closed list whose purpose is to *create the
  caller's relationship to a box*. That list today has exactly one entry:

  | Route | Why it is on the list |
  |---|---|
  | `POST /api/invites/{token}/accept` | Resolves the box from an unguessable token, then creates the membership and (in a second transaction, under `runAsBox`) the subscription. |

  A new entry is added **by name, with its reason**, in this table. Not by analogy to an existing
  one.

**Conformance.** `AuthzConformanceTest` sweeps Spring's live route table and defaults to DENY: a
route in neither `PUBLIC_ALLOWLIST` nor `MIN_ROLE` nor `NON_BOX_SCOPE` fails the build as `unlisted`.
A boxless cross-box route declares **`CROSS_BOX`** in `NON_BOX_SCOPE` — `SELF` is wrong for a route
that reads other people's boxes, and it is the only non-superadmin value that map holds today. The
label and its probe land with the first such route (M24), not before, because a probe family with no
members either asserts a floor of zero or reddens the build.

**One trap recorded in advance for whoever writes that probe:** the sweep detects leaks by planting a
marker string in box A's **name** and asserting it never reaches box B. Under a directory a box's
name is *legitimately public*. A `CROSS_BOX` probe must therefore assert the absence of **private**
markers — a member's email, a plan name, an invite token — and must not assert the absence of the box
name. Splitting `markers` into private and public is the first task on that file.

## 5. The box-switch model

One active box at a time. `POST /api/auth/box-token` checks for an ACTIVE membership, runs
`BoxStatusGuard.requireReachable`, and sets a single `bh_bt` cookie. `TenantContext` is per-request
and derives from the token, so a user holding three boxes needs nothing new: the third box is a third
token, minted the same way as the first.

**The staleness guard.** `localStorage` (`bh_active_box`) is shared across tabs and `bh_bt` is one
cookie, so switching box in one tab silently repoints every other tab, whose next write then lands in
a box the user is not looking at. So `/api/box/**` carries an assertion header:

```
X-Box-Id: <the box the client believes is active>
```

`BoxScopeGuard` (a `HandlerInterceptor`, so the throw renders through `ApiExceptionHandler` as
problem+json) compares it to the JWT's `box_id`:

- **mismatch, or unparseable** → `409` with `detail: STALE_BOX`;
- **absent** → no assertion, request proceeds. Direct API callers and the e2e specs that drive the
  API through Playwright's `request` context send no header and must keep working; the TV surface
  never sends one either, since its routes are `/api/tv/**` and the guard only watches `/api/box/**`;
- **match** → proceeds.

**This does not weaken "never trust box ids from request params".** The header can only *reject* a
request; it never *resolves* a tenant. The tenant still comes from the token and only from the token.
The distinction is the whole design: a header that narrows is safe, a header that selects is not.

`core/auth/auth.interceptor.ts` sends the header on `/api/box/**` **and only when a box is active** —
a boxless session asserts nothing, which is the same "absent means no assertion" case. On a
`STALE_BOX` 409 it re-mints through `selectBox(activeBoxId)` and retries **once**, the same shape it
already used for a 401. The retry is issued from inside `catchError`, so its own failure is caught by
the inner `catchError` and can never re-enter the stale branch: one retry, no loop, and the caller
sees the original 409. The 401 path re-clones through the same helper, so a refreshed retry keeps its
assertion header instead of silently dropping it.

Two tabs on two boxes therefore cost one re-mint each time focus moves, and every request runs against
the box its own tab intended.

## 6. Methods deliberately native, and why

| Repository method | Entity | Why native |
|---|---|---|
| `InviteRepository#findByTokenHash` | `Invite` | Looked up by unguessable token hash before the caller has any box membership — permitAll, no ambient tenant to filter by. |
| `InviteRepository#burnIfUnaccepted` | `Invite` | Bulk `UPDATE` on the same tenant-agnostic accept path; a JPQL bulk update on a `@TenantId` entity is filtered the same as a `SELECT` and would silently update 0 rows for a cross-box accept. |
| `InviteRepository#purgeAcceptedOrExpired` | `Invite` | `PurgeJob`'s nightly bulk delete. Directly invocable from a context that *does* carry a box, where a JPQL version would purge only that box. Guarded by `PurgeJobTest#invitePurgeSweepsBothBoxesEvenUnderOneBoxsAmbientTenant`. |
| `PaymentRepository#findByStripeSessionId` | `Payment` | The Stripe webhook (`permitAll`, no JWT at all) resolves the target box **from this row's own `box_id`** before establishing `runAsBox` — it is both the tenant-less lookup and the box-resolution step. |
| `BookingRepository#findByMembershipIdForExport` | `Booking` | `GET /api/me/export` is served to a **boxless** session, so the derived `findByMembershipId` resolves `NO_TENANT` and returns empty. Safe natively because `membership_id` is itself a per-box key — a membership belongs to exactly one box — so the row set cannot cross a box boundary. Export only; box-scoped callers keep the filtered derived method. |
| `WodScoreRepository#findByMembershipIdForExport` | `WodScore` | Same, for the export's `scores` array. |
| `LiftEntryRepository#findByMembershipIdForExport` | `LiftEntry` | Same, for the export's `lifts` array. |

That is the complete list of methods that bypass the `@TenantId` filter by design. Everything else on
a `@TenantId` entity is a plain derived/JPQL query and is correct as such **because** every caller
either runs inside a real box-scoped request (`SCOPE_box` + `TenantContext`) or explicitly wraps the
call in `runAsBox`/`runAsRoot` first.

`BookingMaintenance`'s no-show sweep is the one reader that is deliberately cross-box: it wraps the
call in `runAsRoot`. It never writes a *new* `@TenantId` row (it flips `status` on already-loaded
`Booking` entities, whose `box_id` was set at their original insert and is never re-stamped on
update), so it never hits failure mode 2.

## 7. Regression coverage

Any method on §6's table, and any `runAsBox`/`runAsRoot` caller, has a test seeding rows in **two**
boxes and asserting the tenant-agnostic path sees/affects both. A single-box test passes against a
silently-broken derived-query version just as happily as against the real fix — which is exactly how
that bug shipped three times.

| Test | What it pins | Mutation it catches |
|---|---|---|
| `TenantIdIsolationTest#plansAreIsolatedPerTenantAtOrmLevel` | normal per-tenant filtering | any break in the discriminator itself |
| `TenantIdIsolationTest#noTenantSessionSeesNothing_pinnedFailClosedBehavior` | a tenant-less read sees **nothing** | restoring `isRoot(NO_TENANT) == true` |
| `TenantIdIsolationTest#runAsRootSeesEveryBox` | root really does disable the filter | `runAsRoot` installing nothing, or the `ROOT` sentinel being dropped |
| `TenantIdIsolationTest#runAsBoxInsideRunAsRootNarrowsToThatBoxAndRestoresRootOnExit` | nesting semantics | a `runAsBox` that clears rather than restores |
| `TenantIdIsolationTest#runAsRootGrantsDatabaseVisibilityButNoAuthority` | root carries no authorities | granting it `SCOPE_box` "for convenience" |
| `TenantIdIsolationTest#writingATenantEntityUnderRootFails` | root is not a writable box | seeding a real `boxes` row for the sentinel |
| `BookingMaintenanceTest#nightlySweepFlipsPastBookedToNoShowInEveryBox` | the sweep runs tenant-less across two boxes | removing `runAsRoot` from `nightlyNoShowSweep` |
| `BoxStalenessGuardTest` (4 cases) | server side: mismatch/unparseable → 409 `STALE_BOX`; match and absent → 2xx | deleting the interceptor, or making it reject the absent-header case |
| `auth.interceptor.spec.ts` — "sends the active box as X-Box-Id on /api/box/** only" | client side: the header goes out, and only on box-scoped URLs | dropping `setHeaders` from the clone (measured: `Expected null to be '1'`) |
| `auth.interceptor.spec.ts` — "re-mints and retries once" / "gives up after one stale retry instead of looping" | the 409 recovery, and its bound | deleting the `STALE_BOX` branch (measured: both go red) |
| `SubscriptionLapseTest#sweepAllFlipsDueSubscriptionsInEveryBoxNotJustOne` | the lapse sweep covers every box | a derived-query regression in the lapse sweep |
| `InviteAcceptApiTest` — cross-box preview, cross-box accept, single-use burn | the tenant-agnostic invite path works from a foreign ambient tenant | reverting any of §6's native methods to JPQL |
| `StripeWebhookTest` | repoint/cross-plan cases over `findByStripeSessionId` | the same, for `Payment` |
| `PurgeJobTest#invitePurgeSweepsBothBoxesEvenUnderOneBoxsAmbientTenant` | the purge is not box-filtered | a JPQL version of `purgeAcceptedOrExpired` |
| `AccountExportTenancyTest#exportReturnsTheUsersBookingsFromABoxlessSession` | the GDPR export still returns bookings and lifts once the `SecurityContext` is **cleared** | reverting any `...ForExport` method to its derived sibling — measured: `Expecting actual not to be empty` |

When adding a new `@TenantId` entity, a new cross-box job, or a new boxless route, add the analogous
two-box test **before** trusting the classification. And run the negative control on it: break the
implementation, watch the test go red, revert. M14a shipped five tests that could not fail, three of
them written during that milestone; review caught none of them and the negative control caught all
five. The most recent instance is in this document's own subject matter —
`SessionApiTest#sweepFlipsPastBookedToNoShow` ran under `actAsBox` and stayed green while the nightly
sweep, measured, flipped nothing in any box.
