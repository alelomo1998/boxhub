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
| `PtBookingRepository#findByCoachMembershipIdForExport` | `PtBooking` | Same boxless-export reasoning, for the export's `ptBookingsAsCoach` array. Safe natively: `coach_membership_id` is a per-box key, same argument as `Booking`. |
| `PtBookingRepository#findByAthleteUserIdForExport` | `PtBooking` | Same, for `ptBookingsAsAthlete`. Safe natively: `athlete_user_id` is exactly the id the export belongs to, so a cross-box return is the point, not a leak. |
| `BookingRepository#findByVisitorUserIdForExport` | `Booking` | Same, for `visitorBookings` (M22 drop-in visitors have no membership at all). Safe natively for the same reason as the athlete-user-id case above. |
| `PostRepository#findByAuthorMembershipIdForExport` | `Post` | Same, for the export's `posts` array. Safe natively: `author_membership_id` is a per-box key. |
| `PostLikeRepository#findByUserIdForExport` | `PostLike` | Same, for `likes`. Safe natively: `user_id` is exactly the id the export belongs to. |
| `WodRatingRepository#findByUserIdForExport` | `WodRating` | Same, for `ratings`. Safe natively: `user_id` is exactly the id the export belongs to. |

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
| `AccountDeletionTest#anExportOfAnM22DomainRowIsStillNonEmptyFromABoxlessSession` | the M22 `...ForExport` additions (PtBooking/Booking-visitor/Post/PostLike/WodRating) hold under the same boxless-session trap | reverting any of the six new `...ForExport` methods to a derived sibling |

When adding a new `@TenantId` entity, a new cross-box job, or a new boxless route, add the analogous
two-box test **before** trusting the classification. And run the negative control on it: break the
implementation, watch the test go red, revert. M14a shipped five tests that could not fail, three of
them written during that milestone; review caught none of them and the negative control caught all
five. The most recent instance is in this document's own subject matter —
`SessionApiTest#sweepFlipsPastBookedToNoShow` ran under `actAsBox` and stayed green while the nightly
sweep, measured, flipped nothing in any box.

## 8. Classifying a new table (M22, binding)

M21 made this question answerable; M22 was the first milestone to cut a whole domain against it and
is where the rule got written down. It has two halves, and **the second half is what stops a leak**.

> **The directory query decides.** A public directory lists **many** boxes at once. A `@TenantId`
> table cannot serve that: `runAsBox` scopes to exactly one box, and `runAsRoot` is for platform
> jobs and is forbidden on a thread serving a user request (§3). So anything read **across** boxes
> must not be `@TenantId` — it carries a plain `box_id` column and every query states its own
> predicate, the `Movement`/`Box`/`Membership` pattern §4 already sanctions.

> **But drop `@TenantId` only when the WHOLE table is public.** A mixed-visibility table keeps the
> discriminator and gets one narrow, registered native read instead (§6).

`box_photo` and `box_hours` qualify: there is nothing private in them to leak through a missed
predicate. `post` does **not** — it holds both `PUBLIC` and `BOX` rows, so one forgotten
`visibility = 'PUBLIC'` would publish a box's private feed. It keeps the discriminator, and M25's
public feed will be a single registered native query.

### 8.1 How M22's tables landed

| Class | Tables | Why |
|---|---|---|
| **Not `@TenantId`** | box public-profile columns on `boxes`, `box_photo`, `box_hours` | The directory reads these across boxes, for boxes the reader does not belong to. Wholly public — nothing private to leak |
| **Not `@TenantId`, keyed on the USER** | `coach_profile`, `coach_availability`, `coach_time_off`, `coach_stripe` | A coach is one person across several boxes — §8.2 |
| **`@TenantId`** | `room`, `pt_booking`, `post`, `post_like`, `wod_rating` (and `bookings`, `payment`, already) | Box-operational or mixed-visibility. The dominant read is a box looking at its own data |
| **`@TenantId`** (M16a) | `entitlement_usage` | Box-operational. Every read is one box counting one of its own members' consumption, on a request thread with a box tenant. M16a added **no** native query and **no** `runAsRoot` |

### 8.2 Why the coach tables are keyed on the user

M21 made it real for one person to hold several boxes. A coach has **one** Stripe account and **one**
calendar across every box they work at. Tenant-scoping either would duplicate credentials per box, or
make them vanish when the coach switches box — which is **failure mode 1** exactly.

Note the deliberate asymmetry: `coach_stripe` is keyed on the **user** ("who is this person's Stripe
account"), while `payment.payee_membership_id` points at a **membership** ("who is owed, in this
box's context"). Two different questions, two correct scopes.

**A caveat about what the test proves.** `CoachProfileTenancyTest` pins this, but its cross-box read
assertion passes *trivially* — with no discriminator anywhere there is nothing to filter. What is
genuinely caught is the mutation "someone tenant-scopes a coach table", in all three shapes it takes:
Hibernate refuses to boot when `@TenantId` lands on an `@Id` field (`coach_profile`, `coach_stripe`),
and raises assigned-tenant-differs on the surrogate-keyed ones (`coach_availability`,
`coach_time_off`). Both were measured. Do not read the green read-assertion as evidence it was
exercised.

### 8.3 The three cross-box reads, named in advance and NOT built

Each is a boxless or cross-box read of a `@TenantId` table, which since M21 returns **empty** rather
than leaking. Each needs the third route §4 sanctions — a **registered native query**, added to §6
with its justification. **`runAsRoot` is never the answer on a request thread.**

M22 built none of them: Phase 1 ships no endpoints, so none has a caller yet. They are named here
because the *schema* has to make them possible, and because a cross-box read discovered later, by
someone who does not know this rule, is exactly how the same bug shipped three times before the M11
audit.

| Cross-box read | Built by | Note |
|---|---|---|
| "My drop-ins across every box" — a boxless session reading its own `bookings` rows | M23/M24 | The boxless shell is where this first has a caller |
| A coach's real free slots — availability at Box A must account for their `pt_booking` rows at Box B | **M26** | **Deferred by D14**, below. This was the milestone's sharpest risk before that assumption |
| The public social feed — `post` rows across boxes where `visibility = 'PUBLIC'` | M25 | |

**M22 did, however, discover a fourth that already had a caller** — the GDPR export — and fixed it.
See §6's nine `...ForExport` rows. The lesson generalises: **when adding a read to any boxless route,
check the entity for `@TenantId` before assuming the query works.** It will not error. It will return
empty, and a test written under `actAsBox` will stay green over it.

### 8.4 D14: a coach works at ONE box for now

Recorded as an assumption with a trigger, not enforced by a constraint. Enforcing it would mean a
partial unique index on `memberships where role = 'COACH'`, which could fail against existing rows
and would have to be dropped the moment multi-box is wanted — a one-way migration spent on a
temporary assumption.

**The schema is already multi-box-ready**, because the coach tables are keyed on the user. So
enabling multi-box coaching needs **no migration** — only the cross-box availability read in §8.3,
which is M26's.

**Trigger:** the first coach holding a `COACH` membership at two boxes. Until that read lands, such a
coach would show as free at Box A while booked at Box B.
