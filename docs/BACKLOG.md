# Backlog — one line per idea, triaged at milestone end

## Closed in M1
- ~~Box-token not renewed by refresh flow~~ — DONE M1-T10 (interceptor re-mints box token after refresh).
- ~~Rate limiting on auth endpoints (spec §6)~~ — DONE M1-T9 (per-IP on nginx X-Real-IP).
- ~~memberships FKs lack on-delete behavior~~ — DONE M1-T1 (user_id ON DELETE CASCADE; box_id stays RESTRICT).
- ~~Refresh response memberships discarded by AuthService.refresh~~ — DONE M1-T14 (refresh now updates memberships signal + localStorage).

## Security / correctness
- ~~Audit all @TenantId entities for JPQL/derived queries that must be tenant-agnostic~~ — DONE M11-T3 (`docs/TENANCY.md` is now the convention note, linked from CLAUDE.md; found and fixed a 4th instance on the public invite preview).
- ~~No server-side logout/revocation endpoint~~ — DONE M8 (sessions list + log-out-everywhere) and M11-T8 (`DELETE /api/auth/sessions/{familyId}`, per-session kill).
- ~~No purge job for expired refresh_tokens / accepted-or-expired invites rows~~ — DONE M11-T10 (nightly `PurgeJob` also sweeps email tokens and stale PENDING TV pairing codes).
- ~~No email delivery for invites~~ — DONE M8-T11.
- Refresh-token concurrent double-use race accepted (no row lock; random single-use tokens).
- Register concurrent-race catch path has no direct test (hard to force with MockMvc; DB-enforced).

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
- Mail templates duplicate the `#D7263D` accent hex across 4 files — centralize if a second brand ever appears.
- `@Async` Mailer uses Spring's default unbounded task executor — fine at pilot mail volume; bound the queue before any bulk/broadcast email feature.
- No "your password was changed" notice email to the old address (standard account-security practice).
- Google concurrency test can't self-verify the double-click race actually fired (relies on incidental scheduling); `recoverFromLinkRace`'s `link()` is unguarded under triple-concurrency (self-heals on retry).
- The auth interceptor's `catchError` also routes a genuine non-token failure of a refresh-retried request into the logout path (pre-M8 quirk, preserved).
- `runner`/`tv` e2e specs are not idempotent (fixed-name TV devices accumulate) — pass only on a fresh stack; per-test DB isolation would end this whole family.
- `register` timing: the not-proven-by-invite path pays a synchronous `EmailTokenService.issue()` DB round-trip the invite path skips — theoretical only (attacker must already hold the 256-bit token to take the fast path).
- **Re-verify the CSRF matcher + `securityContext` repository wiring on any Spring Security upgrade** — both M8 fixes are coupled to 6.4.2 filter-chain internals.

## Deferred from M9 (onboarding)
- Existing logged-in user creates a second box ("Start your box" while authenticated).
- Slug rename + freeing slugs of REJECTED boxes.
- Waitlist auto-notify when capacity opens (capture-only in M9; contact is manual).
- Superadmin audit log (who approved/suspended what, when).
- Approval SLA / reminder emails for boxes sitting in the pending queue.
- Superadmin console per-row action buttons share one `queueActionId`/`boxesActionId` signal each — only one row's action is reflected in the disabled state at a time, so two rows clicked back-to-back both fire real HTTP requests with only one showing pending (internal tool, not a correctness bug — flagged by the T5 review, not fixed since the brief didn't ask for concurrent multi-row optimistic UI).
- OPEN-mode signup cap is soft/racy (check-then-act before the tx — concurrent OPEN signups can overshoot maxBoxes by the concurrency degree); APPROVAL-mode cap is hard (atomic in-tx recheck in BoxLifecycleTx.approve). Accepted at single-node/pilot scale; tighten if OPEN mode + real concurrency ever matters.
- verify.page post-verify does not auto-select a box even with a single membership (pre-existing M8); the M9 e2e routes through /auth/boxes to work around it.
- Superadmin console per-row action-pending is a single scalar signal — clicking approve on row A then reject on row B before A resolves re-enables A mid-flight (duplicate-submit window on an internal tool).
## Deferred from M10 (memberships & payments)
- Stripe recurring / auto-renew subscriptions (v1 is Checkout one-payment-per-period, manual renewal driven by the lapse email).
- Class-packs / credit punch-cards (N-session decrementing buckets) — v1 entitlements are UNLIMITED or WEEKLY_LIMIT only.
- Reusable named per-user discount catalog (a "20% student" rule that auto-reapplies on renewal) — v1 stores the agreed price per subscription.
- PDF receipts — v1 receipt is a printable HTML page.
- Proration / plan-change mid-period; refunds; grace-period window on lapse; pending-confirmation offline handshake.
- Stripe Connect (OAuth, no stored keys) — revisit post-v1 if BoxHub ever takes a cut.
- Online per-user discounts / Stripe coupons — self-serve Checkout charges list price only in v1.
- `MemberController.toDto` runs `activeFor` + a plan lookup per row — a 100-member page costs ~200 extra queries where the pre-M10 version cost one join (flagged by the M10 final review; joins the pre-existing member-list N+1 item).
- Receipts compute the discount against the plan's CURRENT list price, so re-opening an old receipt after a price change shows a discount that was never given — snapshot `listPriceCents` onto the Payment row if receipts must be durable financial documents.
- Drop the now-unwritten `memberships.expires_at` column (M10 moved expiry to `subscription.current_period_end`; the three surfaces were repointed but the column survives because dropping it needs a migration and M10 was V14-only).
- The self-serve box owner (`BoxSignupTx`) gets a BOX_ADMIN membership with no subscription, so an owner cannot book their own classes until someone records a payment for them — the third membership-creation route, and the only one still uncovered.
- The invite form's plan is required only when the box already HAS priced plans; a brand-new box with zero plans can still send a plan-less invite, which still produces a member who cannot book.
- `INVALID_PLAN` / `INVALID_MEMBERSHIP` (400 from `POST /api/box/subscriptions`) have no friendly frontend copy — only reachable via a raw API call, since the form disables submit without both fields.
- ~~The Stripe webhook answers 200 for an unknown session id and 400 for a known one whose box has no credentials~~ — CLOSED in M11 T6: both paths now return 200 and neither writes. A narrower residual is **deliberately kept**: a forged signature on a *known* session still returns 400. That is Stripe's own convention and the only misconfiguration signal an operator gets, and exploiting it requires already holding an unguessable Stripe session id.
- **`docker/docker-compose.yml` uses shell-level `:-` fallbacks for `BOXHUB_JWT_SECRET`, `BOXHUB_STRIPE_ENC_KEYS` and `BOXHUB_MEDIA_LINK_SECRET`.** Compose interpolation resolves *before* Spring sees the placeholder, so a deploy driven from this file silently runs on committed dev secrets — defeating `SecretDefaultsTest` for exactly the path someone would take, and `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}` invites `SPRING_PROFILE=prod` on it. **Do not just delete the `:-`** — compose would then pass empty strings, and only `CryptoService`/`JwtConfig`/`MediaSigner`'s own blank guards would catch it. Real fix: `env_file` + `.env.example`, so compose omits unset vars entirely and Spring's bare `${VAR}` fails closed. For M11 T12 / the Production phase.
- `payment-receipt.html` divides cents by 100 inside the Thymeleaf mail template (email cannot route through the Angular frontend's formatting) — the only place backend-side currency formatting exists; no DTO or stored value uses a float.
- `checkout.session.async_payment_failed` is not handled — a failed delayed-notification payment leaves its Payment row PENDING forever. Correct today (nothing is granted), but there is no cleanup or notification.

## Deferred from M11 (security hardening) — decided during the M11 brainstorm
- **Full audit log** (M11 ships only a minimal superadmin lifecycle log): every admin action and member-data access, hash-chained/immutable rows, retention policy, search + filter UI, export.
- **Redis-backed distributed rate limiting** — M11's limiter stays in-memory and single-node, which matches the one-VPS target; revisit only when a second node actually exists.
- **Superadmin account model** to replace the `BOXHUB_SUPERADMIN_EMAILS` env allowlist (no account, no per-superadmin identity beyond the email claim).
- `POST /api/box/sessions/{id}/checkin|uncheck|no-show` return 500, not 400, when the body carries no `bookingId` (`SessionController.BookingIdRequest` has no `@NotNull` and the params are not `@Valid`, so `bookings.findById(null)` throws) — found by the authz sweep's positive control; authz runs first, so it is an unmapped 500 on malformed input, not a security hole.

### Found during M11 execution (not fixed — out of milestone scope)
- **Google SSO is unreachable behind nginx.** `docker/nginx.conf` has no `/oauth2` location and never did, so the login page's `<a href="/oauth2/authorization/google">` falls through to the SPA catch-all instead of Spring Security's authorization endpoint. Invisible in dev because the OAuth2 chain is conditional on `BOXHUB_GOOGLE_CLIENT_ID`, which the dev compose doesn't set — but a production deploy that DOES set it gets a dead button. Pre-M11; found by the T11 CSP reviewer. Fix is one `location /oauth2/ { proxy_pass ... }` block plus `/login/oauth2/` for the callback, and an e2e or curl assertion so it can't rot again.
- **Angular 19 is EOL with published advisories.** `npm audit --omit=dev` reports 6 high, all cascades of an Angular SSR client-hydration CVE that this client-rendered-only app cannot hit (no `provideClientHydration`, no `@angular/ssr`). The only fix npm offers is 19→22, a three-major upgrade. Deferred to **M12 (frontend rework)**; when it lands, flip the per-push gate in `.github/workflows/ci.yml` to `--audit-level=high` and drop `continue-on-error` from the nightly informational step.
- **`SuperadminAuditRepository` extends `JpaRepository`**, which inherits `delete()`/`deleteAll()`/`save()`, so the audit log's append-only property is enforced by convention (a comment) rather than structurally. Extending `Repository<>` and declaring only `save` + the finder would make it enforceable.
- **An ACTIVE `TvDevice` keeps its `pairing_code` forever** (`TvPairingService.claim` deliberately retains it so the TV's in-flight poll still resolves), so the 6-digit code space fills monotonically as boxes pair devices. M11-T10's purge only sweeps stale PENDING rows. Null the code once the device's first post-claim poll has succeeded.
- **`docker-compose.yml` uses shell-level `:-` fallbacks for all three secrets**, so compose interpolation resolves BEFORE Spring and a deploy from that file silently runs on committed dev secrets — defeating `SecretDefaultsTest` for exactly the path someone would take. `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}` invites `SPRING_PROFILE=prod` on it. The naive fix is wrong (deleting `:-` makes compose pass empty strings); the real fix is `env_file` + `.env.example` so compose omits unset vars and Spring's bare `${VAR}` fails closed. **For the Production phase.**
- **EXIF stripping covers JPEG/PNG only** — the JDK ships no WebP `ImageIO` codec, so WebP uploads pass through with metadata intact (`MediaStorage`, flagged with a `ponytail:` comment naming TwelveMonkeys as the upgrade path). Low risk (GPS EXIF is a camera-JPEG artifact) but a real gap.
- Email addresses are still logged in DTO lines (`LogHygieneTest` only guards secrets/JWTs/keys) — PII in logs, not a credential leak.
