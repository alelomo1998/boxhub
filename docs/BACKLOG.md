# Backlog

**Organised by DESTINATION, not by origin milestone.** (Re-triaged 2026-07-27 — it had grown to 120
open lines filed by *when* they were deferred, which told you nothing about *what to do*.)

Every open item below belongs to exactly one destination. When you finish a milestone, delete its
section rather than striking items through; the closed-item archive at the bottom keeps only
entries whose history is still load-bearing.

**Four kinds of thing live here, and they are not the same:**
- **Scheduled** — assigned to a milestone (M12a/b/c, M12, M15–M17, Project 2). Real work, real owner.
- **Accepted** — a decision, not debt. Do not "fix" without re-opening the decision.
- **Watch-list** — correct today, revisit when a named trigger fires. Not scheduled on purpose.
- **Archive** — done or dead. Kept only where the reasoning still matters.

---

## M12a · Test & CI reliability  → do FIRST

*Why first: M11 shipped three failures that only appeared on CI, hidden behind a local green and a
flaky spec. Until the gates are trustworthy, every later milestone is guessing.*

- **Per-test DB isolation for e2e.** One root cause behind three separately-filed symptoms: `runner`/`tv`
  specs are not idempotent (fixed-name TV devices accumulate, so they pass only on a fresh stack);
  `programming.spec` republishes a today class and had to be retargeted at "Burn It" to avoid clobbering
  `tracking.spec`'s Fran session; and login/admin-panel/invite specs fail at `--retries=0` but pass with
  the configured `retries=1`. Fixing isolation ends this whole family.
- **`e2e/tests/runner.spec.ts` is flaky on CI** — `expect(tv.locator('.tvtimer')).toBeVisible({timeout: 15000})`
  at line 50: the TV never receives the SSE push that starts the giant clock. Failed 3× across 2 unrelated
  dependency PRs on 2026-07-27, passed on re-run each time, passes locally. Timing sensitivity on slower
  runners. The real cost is that it trains people to re-run red pipelines without reading them.
  Fix by waiting on the SSE state rather than the rendered element.
- `TvStreamService`: no `scope=="box"`-token-rejected stream test (`boxTokenIsNotATvToken` asserts
  unknown-device instead — inherited from the plan's own test code).
- `RepositoryTest` cannot detect a join-fetch regression in `findByUserIdWithBox`.
- Google concurrency test can't self-verify the double-click race actually fired (relies on incidental
  scheduling).
- `box-settings` partial-patch branches not individually tested (timezone-only, logo-clear).
- Register concurrent-race catch path has no direct test (hard to force with MockMvc; DB-enforced).

## M12b · Correctness & data integrity

*Small, invisible, mostly backend. None of it ships a screen, so none of it is invalidated by the UX rework.*

- **Member patch accepts an unknown/foreign `planId` unchecked** — FK only requires the plan to exist, so a
  foreign one persists and renders `planName` null. Validate tenant-scoped, the way invite-create does.
- **The self-serve box owner (`BoxSignupTx`) gets a BOX_ADMIN membership with no subscription**, so an owner
  cannot book their own classes until someone records a payment for them. Third membership-creation route,
  and the only one still uncovered.
- **A brand-new box with zero priced plans can still send a plan-less invite**, producing a member who
  cannot book. The invite form requires a plan only when the box already HAS priced plans.
- **`checkout.session.async_payment_failed` is not handled** — a failed delayed-notification payment leaves
  its Payment row PENDING forever. Correct today (nothing is granted), but no cleanup and no notification.
- **Receipts compute the discount against the plan's CURRENT list price**, so re-opening an old receipt after
  a price change shows a discount that was never given. Snapshot `listPriceCents` onto the Payment row if
  receipts are to be durable financial documents.
- **Drop the now-unwritten `memberships.expires_at` column** (M10 moved expiry to
  `subscription.current_period_end`; all three surfaces were repointed, the column survived because
  dropping it needs a migration). **Next Flyway is V16.**
- `POST /api/box/sessions/{id}/checkin|uncheck|no-show` return 500, not 400, on a body with no `bookingId`
  (`BookingIdRequest` has no `@NotNull`, params are not `@Valid`, so `bookings.findById(null)` throws).
  Authz runs first, so it is unmapped malformed-input handling, not a security hole.
- **Timer concurrency:** two coaches on one session race the `class_timers` row (last-write, no lock), and
  `act()`'s first-ARM is check-then-insert, so concurrent first-ARMs race the unique index → 500. No
  `DataIntegrityViolation` handler anywhere.
- **Instance-builder save creates new `wod` rows on every edited re-save** — quick-created pieces become
  library wods each time, so the library grows unboundedly. Dedupe or update-in-place.
- **Types-page fan-out** (image/skeleton applied per weekly slot row) — a partial failure leaves slots
  inconsistent. Move "class type" to a first-class entity if it bites.
- `SuperadminAuditRepository` extends `JpaRepository`, inheriting `delete()`/`deleteAll()`/`save()`, so the
  audit log's append-only property is convention (a comment) rather than structural. Extending `Repository<>`
  and declaring only `save` + the finder would make it enforceable.
- Box timezone is not validated on create/settings-patch — arbitrary strings persist (admin/superadmin
  are trusted, so this is low severity).
- `Membership.role`/`status` are plain Strings (DB check-constrained) — consider enums.

## M12c · Production readiness

*Blockers for a real deploy. Independent of the UX rework; some are live bugs today.*

- **Google SSO is unreachable behind nginx.** `docker/nginx.conf` has no `/oauth2` location and never did,
  so the login page's `<a href="/oauth2/authorization/google">` falls through to the SPA catch-all instead of
  Spring Security's authorization endpoint. Invisible in dev because the OAuth2 chain is conditional on
  `BOXHUB_GOOGLE_CLIENT_ID`, which the dev compose doesn't set — but a production deploy that DOES set it
  gets a dead button. Fix is one `location /oauth2/` proxy block plus `/login/oauth2/` for the callback,
  and a curl or e2e assertion so it cannot rot again.
- **`docker/docker-compose.yml` uses shell-level `:-` fallbacks for all three secrets.** Compose
  interpolation resolves *before* Spring sees the placeholder, so a deploy driven from this file silently
  runs on committed dev secrets — defeating `SecretDefaultsTest` for exactly the path someone would take.
  `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}` invites `SPRING_PROFILE=prod` on it. **Do not just delete
  the `:-`** — compose would then pass empty strings. Real fix: `env_file` + `.env.example`, so compose omits
  unset vars entirely and Spring's bare `${VAR}` fails closed.
- **EXIF stripping covers JPEG/PNG only** — the JDK ships no WebP `ImageIO` codec, so WebP uploads pass
  through with metadata intact (`MediaStorage`, flagged with a `ponytail:` comment naming TwelveMonkeys).
  Low risk (GPS EXIF is a camera-JPEG artifact) but a real gap.
- Email addresses are still logged in DTO lines — `LogHygieneTest` guards secrets/JWTs/keys only. PII in
  logs, not a credential leak.
- Everything already scoped to the **Launch → Production** phase stays there: TLS/HSTS enforcement, domain,
  firewall, SSH hardening, Postgres backups **and a restore drill**, secrets delivery on the host, log
  retention, CI deploy on green.

## M12 · UX/UI rework  *(the milestone this all clears the way for)*

**Task 1 is the Angular 19 → 22 upgrade.** Angular 19 is EOL; `npm audit --omit=dev` reports 6 high, all
cascades of an SSR client-hydration CVE this client-rendered-only app cannot hit. It moves every file's
baseline, so it must land before the rework, not after. When it does: flip the per-push gate in
`.github/workflows/ci.yml` to `--audit-level=high`, drop `continue-on-error` from the nightly informational
step, and fold npm back into the OSV gate.

**Structure & system**
- Coach + admin surfaces are still pre-rebuild: raw px type sizes, sub-44px targets, screens re-implementing
  `bh-*` input styles (wod-builder/calendar/tracks/movements), no loading states.
- Header CSS is ~90% duplicated across three shells; logout/theme placement differs per shell (athlete
  profile sheet vs coach/admin header ⎋). Fold into a shared shell.
- Unicode glyph icons (⎋ ⌘ ◐) read as a placeholder icon system — adopt a real icon set.
- Admin tables on phone are scroll-tables, not cards.
- Mail templates duplicate the `#D7263D` accent hex across 4 files — centralise.

**Interaction & flow**
- **Day pager** (Book + coach Classes): no swipe, chevrons outside the thumb zone, no week-strip with
  availability dots — paging to the next open class can take 13 taps. 14-day bound.
- Score grid: no auto-advance to the next athlete, no Enter-to-save, no sticky clock while scrolling to
  Scores, Reset zeroes elapsed with no confirm, no hint text on EMOM/Tabata fields.
- Score form has no cancel/delete of a logged score (edit-only); no way to delete a lift entry.
- Booking error renders at the list top, not in the card foot next to the button that caused it.
- Builder score-type select is still a 5-option decision per scored piece.
- No coach-facing help for the skeleton → instance → publish flow.
- `verify.page` does not auto-select a box even with a single membership (pre-existing M8; the M9 e2e
  routes through `/auth/boxes` to work around it).
- Superadmin console per-row actions share one `queueActionId`/`boxesActionId` signal, so clicking approve
  on row A then reject on row B before A resolves re-enables A mid-flight (internal tool, duplicate-submit
  window).
- `members.page` search fires one request per keystroke — no debounce.
- Coach check-in long-press maps to contextmenu (desktop right-click); verify iOS Safari on a real device.
- Timer initial-GET has no distinct loading vs empty state.
- `INVALID_PLAN` / `INVALID_MEMBERSHIP` (400 from `POST /api/box/subscriptions`) have no friendly copy.
- join page: accept/register tail duplication; login link is a plain href, not `routerLink`; admin pages use
  `ngOnInit` without `implements OnInit`.

**Delight & polish**
- Leaderboard button could show score count ("3 posted"); score-save could show your rank ("you're 3rd") as
  the peak-end beat.
- Drag-and-drop reorder + drag-to-move calendar slots (today: up/down + click-assign).

**Accessibility**
- RX/Scaled segmented control: `role="radio"` without roving tabindex/arrow keys; sheet discard bar doesn't
  move focus on appear.
- Sheet component: no focus trap beyond native `<dialog>`, no swipe-to-dismiss.
- `progression-chart` aria conveys count + best only, not per-point data (a table alternative exists below it).

**Bugs surfaced by design review**
- Shared leaderboard URL loses the WOD title (query param); leaderboard `track e.rank` breaks on tied ranks
  if the API ever ties.
- Impeccable detector false-positive: Angular `[src]` bindings inside `@if` guards trip `broken-image` —
  consider a repo-level ignore if the noise annoys.

## Project 2 · The Room *(TV board — owned end to end there)*

- **TV command (M7.5)** — `tv_devices.view`, manual per-device board/leaderboard/timer selection. User has
  confirmed this is genuinely needed, not polish: auto-driven-only TVs aren't realistic for a multi-screen box.
- **Heats/teams** — split the roster into n heats/teams plus a team score model; the runner's roster strip is
  where it slots in.
- Timer audio/beeps + last-3 countdown on the TV (today: visual only).
- Per-device views, timers, PR-celebration takeover.
- **An ACTIVE `TvDevice` keeps its `pairing_code` forever** (`TvPairingService.claim` retains it so the TV's
  in-flight poll still resolves), so the 6-digit code space fills monotonically as boxes pair devices. M11's
  purge only sweeps stale PENDING rows. Null the code once the first post-claim poll succeeds.
- Admin TVs page: `renameTv()` service method has no UI hookup (list is claim + remove only).

## M15 · Programming & tracking depth  *(after M12 — these ship screens)*

- Movement media: videos, coaching cues, images (seed is names + category + modality only).
- WOD versioning / revision history / comments.
- **Snapshot-on-publish** — editing a published WOD is currently live, so athletes see edits immediately,
  including after scores exist.
- Tag system + search-by-movement across the WOD library.
- Structured minute-by-minute EMOM/interval modelling (hybrid text lines cover it for now).
- Bulk-copy a full week to another week / programming-cycle templates.
- **Load unit (kg/lb) per-box setting + conversion** — loads are unitless product-wide today, and the
  leaderboard hero makes it louder. *(Was filed twice, M4 and M5.5.)*
- Rep-adjusted 1RM estimation for PRs (auto-PR is raw best-load, rep-agnostic).
- Score photos/videos; comments/reactions on scores.
- Cross-box/global benchmark leaderboards (e.g. an all-boxes Fran board).
- Advanced charting: zoom, multi-movement overlay, PR trend lines.
- Realtime/live leaderboard push for athletes (the athlete board is on-load only; the TV already has SSE).
- Offline IndexedDB score queue — the runner grid is optimistic + per-cell retry, so a mid-outage reload
  loses unsent cells.
- FOR_TIME cannot be armed without a cap (`buildSpec` requires `totalSeconds>0`) — uncapped count-up
  For Time is unsupported.
- "Bookings open at" windows (a class that opens for booking at a set time).

## M16 · Payments depth  *(after M12)*

- Stripe recurring / auto-renew (v1 is Checkout, one payment per period, manual renewal driven by the lapse email).
- Class-packs / credit punch-cards (N-session decrementing buckets) — v1 entitlements are UNLIMITED or WEEKLY_LIMIT.
- Reusable named per-user discount catalog (a "20% student" rule that auto-reapplies on renewal) — v1 stores
  the agreed price per subscription.
- Online per-user discounts / Stripe coupons — self-serve Checkout charges list price only.
- PDF receipts (v1 is a printable HTML page).
- Proration / plan-change mid-period; refunds; grace-period window on lapse; pending-confirmation offline handshake.
- Stripe Connect (OAuth, no stored keys) — revisit post-v1 if BoxHub ever takes a cut.

## M17 · Platform & accounts  *(after M12)*

- **Superadmin account model** to replace the `BOXHUB_SUPERADMIN_EMAILS` env allowlist — no account, no
  per-superadmin identity beyond the email claim. *(Was filed twice, M8 and M11.)*
- **Full audit log** — every admin action and member-data access, hash-chained/immutable rows, retention
  policy, search + filter UI, export. M11 ships only the minimal superadmin lifecycle log.
- Box deletion / box-level data export — BoxHub is the processor, the box is the controller; separate design.
- Existing logged-in user creates a second box ("Start your box" while authenticated).
- Slug rename + freeing the slugs of REJECTED boxes.
- Waitlist auto-notify when capacity opens (M9 is capture-only; contact is manual).
- Approval SLA / reminder emails for boxes sitting in the pending queue.
- "Your password was changed" notice email to the old address (standard account-security practice).
- Bound the `@Async` Mailer queue before any bulk/broadcast email feature (Spring's default executor is
  unbounded — fine at pilot mail volume).

---

## Watch-list — correct today, revisit when the named trigger fires

*Deliberately unscheduled. Every one is marked "fine at pilot scale" in its original review; scheduling them
now would be speculative work with no load data behind it.*

- `MemberController.toDto` runs `activeFor` + a plan lookup per row — a 100-member page costs ~200 extra
  queries where the pre-M10 version cost one join. **Trigger:** member lists get slow, or a box passes ~200 members.
- `HistoryController`/`LeaderboardController` use `findAll()` maps for name/context lookup. **Trigger:** a box's
  history grows hot.
- `LiftController /prs` groups in Java over all the athlete's lifts. **Trigger:** an athlete with years of history.
- Invite `pending()` filters in memory. **Trigger:** a box's invite history grows.
- Coach `upsertFor` could use `findByIdAndBoxId` single-query instead of `findById` + lazy box filter.
- **Redis-backed distributed rate limiting** and **Redis pub/sub for the SSE emitter registry** — both are
  per-node in-memory, which matches the one-VPS target. **Trigger:** a second node actually exists.

## Accepted — decisions, not debt

*Do not "fix" these without re-opening the decision that made them.*

- Refresh-token concurrent double-use race (no row lock; tokens are random and single-use).
- `WodService.deserialize` swallows bad JSON to empty blocks — defensive, and only reachable via direct DB
  tampering since every write goes through `serialize`.
- OPEN-mode signup cap is soft/racy (check-then-act before the tx); APPROVAL-mode is hard (atomic in-tx
  recheck). Accepted at single-node/pilot scale.
- The auth interceptor's `catchError` routes a genuine non-token failure of a refresh-retried request into the
  logout path (pre-M8 quirk, preserved deliberately).
- Interceptor reselect `catchError` rethrows the outer error, not the reselect error — intentional, so the
  caller sees the original 401.
- Frontend concurrent 401s trigger parallel refresh calls (no de-dupe) — cosmetic token churn.
- `login`/`refresh` membership-mapping duplication in `AuthController` — extract a helper at the *third* caller.
- `AuthController.boxToken`'s `userRepo` lookup is load-bearing (`mem.getUser()` is a lazy proxy outside the
  tx, OSIV off) — fetch-join only if it ever matters.
- `payment-receipt.html` divides cents by 100 inside the Thymeleaf template — email cannot route through the
  Angular frontend's formatting, so this is the only backend-side currency formatting. No DTO or stored value
  uses a float.
- `register` timing: the not-proven-by-invite path pays a synchronous `EmailTokenService.issue()` round-trip
  the invite path skips. Theoretical only — an attacker must already hold the 256-bit token to take the fast path.
- The Stripe webhook returns 400 for a **forged signature on a known session id**. Stripe's own convention and
  the only misconfiguration signal an operator gets; exploiting it requires already holding an unguessable
  session id. (The unknown-vs-no-credentials oracle was closed in M11 T6 — both now return 200.)

## Standing instructions

- **Re-verify the CSRF matcher and `securityContext` repository wiring on any Spring Security upgrade** —
  both M8 fixes are coupled to filter-chain internals. **This fired on 2026-07-27:** Spring Boot 3.4→3.5 moved
  Spring Security 6.4→6.5. Re-verified then by the full backend suite (390/0) plus e2e 26/26 on a rebuilt
  stack, which exercises the real cookie + CSRF paths. Repeat this on the next upgrade.

---

## Archive — closed, kept only where the reasoning still matters

**Closed by M11** (these sat open in the backlog long after they were done):
- ~~Media reads unauthenticated; add signed URLs + EXIF strip~~ — M11 T4. *(WebP gap tracked in M12c.)*
- ~~TV stream token rides a query param~~ — M11 T5, now the `bh_tv` httpOnly cookie.
- ~~Superadmin audit log~~ — M11 T7.
- ~~Per-session kill~~ — M11 T8, `DELETE /api/auth/sessions/{familyId}`.
- ~~No purge job for expired refresh_tokens / invites / TV pairing codes~~ — M11 T10.
- ~~Audit all `@TenantId` entities for tenant-agnostic JPQL~~ — M11 T3; `docs/TENANCY.md` is now the
  convention note, and the audit found a 4th live instance on the public invite preview.
- ~~The Stripe webhook's unknown-vs-no-credentials existence oracle~~ — M11 T6, both paths return 200.

**Dead — the thing they describe no longer exists:**
- ~~`program_slot` unique-conflict surfaces as 500~~ — `program_slot` was **dropped in M5 (Flyway V7)**.
- ~~Coach bulk score-entry grid~~ — shipped as the M7 runner score grid.
- ~~Login page `selectBox` failure is silent~~ — fixed in M9 T7 (error arms on both call sites, with specs).

**Moved, not dropped:**
- ~~2FA / TOTP for box owners + superadmins~~ — promoted to a real milestone, **M14**, on the v1 roadmap.

**Closed in M0/M1:** box-token renewal on refresh (M1-T10) · auth rate limiting (M1-T9) · memberships FK
on-delete (M1-T1) · refresh discarding memberships (M1-T14) · invite email delivery (M8-T11) ·
server-side logout/revocation (M8 + M11-T8).
