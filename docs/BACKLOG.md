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

## Deferred from M3 (programming)
- Movement media: videos, coaching cues, images (seed is names + category + modality only).
- WOD versioning / revision history / comments.
- Tag system + search-by-movement across the WOD library.
- Structured minute-by-minute EMOM/interval modeling (hybrid text lines cover it for now).
- Snapshot-on-publish: editing a published WOD is currently live (athletes see edits immediately).
- Drag-and-drop track reorder + drag-to-move calendar slots (M3 ships up/down + click-assign).
- Bulk-copy a full week to another week / programming-cycle templates.
- `program_slot` unique-conflict on concurrent assign to same (date,track) surfaces as 500 (upsert find-or-create races) — add ON CONFLICT / retry if two coaches program the same cell simultaneously.
- WodService.deserialize swallows bad JSON to empty blocks (defensive; malformed blocks_json would silently blank a WOD's structure — only reachable via direct DB tampering since writes go through serialize).

## Deferred from M4 (tracking)
- Realtime/live leaderboard push (M5 TV) — M4 leaderboard is on-load only.
- Coach bulk score-entry grid (M6 class runner) — M4 is athlete self-log only.
- Rep-adjusted 1RM estimation for PRs — auto-PR is raw best-load, rep-agnostic.
- Load unit (kg/lb) per-box setting + conversion — `wod_score.load`/`lift_entry.load` are unit-agnostic numerics, displayed as-is.
- Score photos/videos; comments/reactions on scores.
- Cross-box/global benchmark leaderboards (e.g. all-boxes Fran board).
- Advanced charting: zoom, multi-movement overlay, PR trend lines (M4 chart is a single-movement inline SVG line).
- HistoryController/LeaderboardController use `findAll()` maps (slots/wods/tracks/memberships) for name/context lookup — fine at pilot scale; batch/join if a box's history grows hot.
- LiftController `/prs` groups in Java over all the athlete's lifts — fine at pilot scale.

## Deferred from athlete rebuild (impeccable critique 2026-07-09, snapshot in .impeccable/)
- Coach + admin surfaces still pre-rebuild: raw px type sizes, sub-44px targets, screens re-implementing bh-* input styles (wod-builder/calendar/tracks/movements pages), no loading states.
- Leaderboard button could show score count ("3 posted"); score-save could show your rank ("you're 3rd") as the peak-end beat.
- Score form: no cancel/delete of a logged score (edit-only); no way to delete a lift entry.
- Sheet component: no focus trap beyond native dialog behavior; no swipe-to-dismiss.
- progression-chart aria conveys count+best only, not per-point data (table alternative exists below it).

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
