# Backlog — one line per idea, triaged at milestone end

## Closed in M1
- ~~Box-token not renewed by refresh flow~~ — DONE M1-T10 (interceptor re-mints box token after refresh).
- ~~Rate limiting on auth endpoints (spec §6)~~ — DONE M1-T9 (per-IP on nginx X-Real-IP).
- ~~memberships FKs lack on-delete behavior~~ — DONE M1-T1 (user_id ON DELETE CASCADE; box_id stays RESTRICT).
- ~~Refresh response memberships discarded by AuthService.refresh~~ — DONE M1-T14 (refresh now updates memberships signal + localStorage).

## Security / correctness
- **Audit all @TenantId entities (Plan, Invite) for JPQL/derived queries that must be tenant-agnostic.** M1 found BOTH `findByTokenHash` AND the `burnIfUnaccepted` bulk UPDATE were silently @TenantId-filtered (broke cross-box invite accept); fixed to native SQL. Plan queries are currently all box-scoped so correct-by-context, but the trap is latent — any future tenant-agnostic access to a @TenantId entity via JPQL will silently filter. Consider a lint/convention note.
- No server-side logout/revocation endpoint; refresh tokens valid 30d after client logout.
- No purge job for expired refresh_tokens / accepted-or-expired invites rows.
- Refresh-token concurrent double-use race accepted (no row lock; random single-use tokens).
- Register concurrent-race catch path has no direct test (hard to force with MockMvc; DB-enforced).
- No email delivery for invites — admin copies the shareable link manually (SMTP integration later).

## Quality / polish
- Member list: planName N+1 in MemberController.toDto (bounded by page-size cap 100) — batch findAllById if member lists get hot.
- Invite pending() in-memory filter — derived query (findByAcceptedAtIsNullAndExpiresAtAfter) when a box's invite history grows.
- Member patch accepts unknown/foreign planId unchecked (FK only requires plan exists; renders planName null) — validate tenant-scoped like invite-create does.
- Box timezone not validated on create/settings-patch — arbitrary strings persist (admin/superadmin trusted).
- members.page search: no debounce (1 request per keystroke).
- Membership.role/status are plain Strings (DB check-constrained) — consider enums.
- RepositoryTest cannot detect join-fetch regression in findByUserIdWithBox.
- login/refresh membership-mapping duplication in AuthController — extract helper at third caller.
- AuthController.boxToken userRepo lookup is load-bearing (mem.getUser() lazy proxy outside tx, OSIV off) — fetch-join only if it matters.
- Frontend: concurrent 401s trigger parallel refresh calls (no de-dupe) — cosmetic token churn.
- Login page: selectBox failure inside nested subscribe is silent.
- join page: accept/register tail duplication; login link plain href not routerLink; admin pages use ngOnInit without implements OnInit.
- box-settings partial-patch branches not individually tested (timezone-only, logo-clear).
- interceptor reselect catchError rethrows outer err not reselect err (intentional — caller sees original 401).
- e2e cold-start/parallel-isolation flake: login/admin-panel/invite specs fail with --retries=0, pass with configured retries=1 (shared seeded backend, no per-test isolation). Add test isolation or serialize when it bites.
