# ADR-001: Claim-based tenancy in M0, Hibernate @TenantId from M1

Date: 2026-07-07. Status: accepted.

M0 has no tenant-owned domain tables (users are global; memberships must be readable
across boxes at login). Tenancy is enforced by: (1) box-scoped JWTs minted only after
membership validation, (2) TenantContext as the single tenant resolution point,
(3) mandatory cross-tenant denial tests. Hibernate 6 @TenantId discriminator wiring is
added in M1 together with the first tenant-owned table, using TenantContext as the
CurrentTenantIdentifierResolver source. Revisit if M1 finds @TenantId incompatible with
cross-tenant admin queries — fallback is Spring Data JPA specifications keyed on TenantContext.
