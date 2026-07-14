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

## Deferred from M5 (product UX overhaul)
- Media reads unauthenticated (unguessable UUID paths) — add auth or signed URLs before real athlete photos at scale; EXIF strip.
- Instance-builder save: quick-created pieces become library wods each save — edited re-saves create new wod rows (library grows); dedupe/GC or update-in-place later.
- Types page fan-out (image/skeleton applied per weekly slot row) — partial-failure leaves slots inconsistent; move "class type" to a first-class entity if it bites.
- Book pager: no swipe gesture, 14-day bound; "bookings open at" windows still absent.
- Coach check-in long-press = contextmenu (desktop right-click); verify iOS Safari long-press behavior on device.
- Admin tables on phone are scroll-tables, not cards (shell + dashboard are responsive; deep pages later).
- Detector false-positive pattern: Angular [src] bindings in @if guards trip `broken-image` — consider repo-level ignore for the rule if the noise annoys.

## Deferred from M7 (runner)
- Offline IndexedDB score queue — M7 grid is optimistic + per-cell retry (a mid-outage reload loses unsent cells).
- Timer audio/beeps + last-3 countdown on the TV — M7 is visual only.
- One coach owns the timer: two coaches on one session race the `class_timers` row (last-write, no lock); `act()` first-ARM is check-then-insert, so concurrent first-ARMs race the unique index → 500 (no DataIntegrityViolation handler anywhere).
- Coach `upsertFor` could use `MembershipRepository.findByIdAndBoxId` single-query instead of findById+lazy box filter (plan nit).
- Timer initial-GET has no distinct loading vs empty state.
- FOR_TIME can't be armed without a cap (`buildSpec` requires `totalSeconds>0`; `renderTimer` clamps to it) — uncapped count-up For Time unsupported.
- Score grid is tap-input→type→tap-Save per row: no auto-advance to the next athlete, no Enter-to-save; no sticky clock while scrolling to Scores; Reset zeroes elapsed with no confirm; no hint text on EMOM/Tabata rounds/work/rest fields.
- TV command (M7.5 — `tv_devices.view`, manual per-device board/leaderboard/timer) and heats/teams remain deferred.

## Deferred from M6 (TV)
- TV stream token rides a query param (EventSource can't set headers) — appears in nginx access logs; move to cookie or short-lived stream ticket before real deployments.
- SSE emitter registry is per-node in-memory (like the rate limiter) — Redis pub/sub when a second node exists.
- TV pairing codes recycle only after device deletion; PENDING rows have no purge job (same family as refresh_tokens/invites purge).
- TvStreamService: no `scope=="box"`-token-rejected stream test (the `boxTokenIsNotATvToken` test asserts unknown-device instead — inherited from the plan's own test code).
- Admin TVs page: `renameTv()` service method has no UI hookup yet (list is claim + remove only).
- e2e cross-contamination surfaced in M6: `programming.spec` republishes a today class, so it now targets "Burn It" to avoid clobbering `tracking.spec`'s Fran session; theme font-load test is retry-flaky on cold nginx. Per-test DB isolation would end this whole family.
- Per-device views, timers, PR-celebration takeover — M7 class runner.

## Deferred from M5.5 (fe polish, critique 28/40 — P0 fonts + 3 P1 fixed in-session)
- Loads unitless product-wide — kg/lb box setting (dupes M4 item; leaderboard hero makes it louder).
- Logout/theme placement differs per shell (athlete profile sheet vs coach/admin header ⎋); header CSS ~90% duplicated 3× — fold into the bh-shell dedupe item.
- Day pager (Book + coach Classes): no swipe, chevrons out of thumb zone, no week-strip with availability dots (paging to find the next open class = up to 13 taps).
- Booking error renders at list top, not in the card foot next to the button that caused it.
- RX/Scaled segmented control: role="radio" without roving tabindex/arrow keys; sheet discard bar doesn't move focus on appear.
- Shared leaderboard URL loses WOD title (query param); leaderboard `track e.rank` breaks on tied ranks if API ever ties.
- Unicode glyph icons (⎋ ⌘ ◐) read as placeholder icon system — consider a real icon set.
- Builder score-type select still a 5-option decision per scored piece ("auto (time)" helps).
- No coach-facing help for skeleton→instance→publish flow.

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

## Deferred from M8 (auth & accounts)
- 2FA / TOTP for box owners + superadmins (enrol, QR, recovery codes) — real value for accounts holding a gym's member data, not v1.
- Superadmin auth stays the `BOXHUB_SUPERADMIN_EMAILS` env allowlist (no superadmin account model).
- Box deletion / box-level data export — BoxHub is the processor, the box is the controller; separate design.
- Per-session kill (M8 ships revoke-all only; "I lost my phone" is the real case).
