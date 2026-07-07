# Backlog — one line per idea, triaged at milestone end

- Box-token not renewed by refresh flow: after user-token refresh, stale box token can 401 permanently until re-login — design box-token refresh in M1 before shells make real API calls (see ponytail comment in auth.interceptor.ts). TOP PRIORITY for M1.
- No server-side logout/revocation endpoint; refresh tokens valid 30d after client logout.
- No purge job for expired refresh_tokens rows.
- Rate limiting on auth endpoints (spec §6) — unimplemented, schedule in M1.
- memberships FKs lack on-delete behavior — decide cascade/restrict in V2 migration with M1 schema work.
- Membership.role/status are plain Strings (DB check-constrained) — consider enums in M1 entity work.
- RepositoryTest cannot detect join-fetch regression in findByUserIdWithBox.
- Register concurrent-race catch path has no direct test (hard to force with MockMvc; DB-enforced).
- Refresh-token concurrent double-use race accepted (no row lock; random single-use tokens).
- login/refresh membership-mapping duplication in AuthController — extract helper at third caller.
- AuthController.boxToken userRepo lookup looks redundant but is load-bearing (mem.getUser() is a lazy proxy outside tx, OSIV off) — only replace with fetch-join query if it ever matters.
- Frontend: concurrent 401s trigger parallel refresh calls (no de-dupe) — cosmetic token churn at M0 scale.
- Login page: selectBox failure inside nested subscribe is silent — fold into M1 interceptor rework.
- Refresh response memberships discarded by AuthService.refresh — signal can go stale across long sessions.
