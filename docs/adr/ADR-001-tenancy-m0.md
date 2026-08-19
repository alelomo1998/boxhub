# ADR-001: Claim-based tenancy in M0, Hibernate @TenantId from M1

Date: 2026-07-07. Status: accepted.

M0 has no tenant-owned domain tables (users are global; memberships must be readable
across boxes at login). Tenancy is enforced by: (1) box-scoped JWTs minted only after
membership validation, (2) TenantContext as the single tenant resolution point,
(3) mandatory cross-tenant denial tests. Hibernate 6 @TenantId discriminator wiring is
added in M1 together with the first tenant-owned table, using TenantContext as the
CurrentTenantIdentifierResolver source. Revisit if M1 finds @TenantId incompatible with
cross-tenant admin queries — fallback is Spring Data JPA specifications keyed on TenantContext.

## Amendment (2026-07-08, M1 Task 2) — SUPERSEDED by the M21 amendment below

Hibernate 6 rejects a null tenant identifier at session open once any @TenantId entity
exists. The resolver therefore returns a NO_TENANT sentinel (all-zeros UUID) with
isRoot()=true for unauthenticated/user-scoped sessions: Hibernate skips the tenant
filter for those sessions (fail-OPEN at the ORM layer). Consequences, accepted:

- Isolation for HTTP requests remains enforced at the controller boundary
  (SCOPE_box authority + TenantContext) — null-tenant code must not touch tenant
  tables except deliberate cases (public invite lookup by unguessable token hash).
- A root-session INSERT into a @TenantId entity writes the sentinel into box_id and
  fails the FK constraint — accidental tenant-less writes cannot persist.
- Pinned by TenantIdIsolationTest.nullTenantSessionIsRootAndSeesAllBoxes_pinnedFailOpenBehavior.

## Amendment (2026-08-19, M21 Task 2) — the 2026-07-08 default is REVERSED

The M1 amendment above is superseded on its central point and kept only as the record of what
the system did between M1 and M21.

`isRoot(NO_TENANT)` now returns **false**. A session with no ambient tenant therefore keeps the
tenant filter ON, against a sentinel (all-zeros) UUID no `boxes` row can carry, and a tenant-less
read on a @TenantId entity returns **nothing** instead of every box. Fail-OPEN became fail-CLOSED.

Why: `CookieBearerTokenResolver` hands the *user* token to everything outside `/api/box/**`, and a
user token carries no `box_id`. So the M1 argument — "isolation is enforced at the controller
boundary by SCOPE_box" — held only as long as no route outside `/api/box/**` ever read a tenant
table. M21 makes accounts exist with no box at all and M22–M24 add cross-box read paths, so that
premise expires. The accepted trade, in writing: an accidental cross-box read is now silent-**empty**
(a bug) rather than silent-**everything** (a breach). It is not loud — the resolver runs for every
Hibernate session including the many touching no @TenantId entity, so it cannot know which sessions
to throw for.

- Cross-box visibility is now an explicit, greppable opt-in: `TenantContext.runAsRoot(...)`, which
  installs a `ROOT` (all-`f`s) sentinel that genuinely disables the filter. Platform jobs only; its
  sole caller today is `BookingMaintenance.nightlyNoShowSweep`. It grants **visibility, never
  authority** — the principal carries no authorities.
- The sentinel-INSERT-fails-the-FK consequence is unchanged, and holds for `ROOT` as well, which is
  what stops `runAsRoot` being used as a write tool.
- The M1 pin `TenantIdIsolationTest.nullTenantSessionIsRootAndSeesAllBoxes_pinnedFailOpenBehavior`
  **no longer exists.** It was replaced by
  `TenantIdIsolationTest.noTenantSessionSeesNothing_pinnedFailClosedBehavior`, alongside four new
  cases covering root visibility, nesting, root's lack of authority, and the FK on a root write.
- Full rule: `docs/TENANCY.md`.
