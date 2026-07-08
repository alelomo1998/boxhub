# ADR-001: Claim-based tenancy in M0, Hibernate @TenantId from M1

Date: 2026-07-07. Status: accepted.

M0 has no tenant-owned domain tables (users are global; memberships must be readable
across boxes at login). Tenancy is enforced by: (1) box-scoped JWTs minted only after
membership validation, (2) TenantContext as the single tenant resolution point,
(3) mandatory cross-tenant denial tests. Hibernate 6 @TenantId discriminator wiring is
added in M1 together with the first tenant-owned table, using TenantContext as the
CurrentTenantIdentifierResolver source. Revisit if M1 finds @TenantId incompatible with
cross-tenant admin queries — fallback is Spring Data JPA specifications keyed on TenantContext.

## Amendment (2026-07-08, M1 Task 2)

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
