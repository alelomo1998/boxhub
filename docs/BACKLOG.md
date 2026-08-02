# Backlog

**Organised by DESTINATION, not by origin milestone.** (Re-triaged 2026-07-27 — it had grown to 120
open lines filed by *when* they were deferred, which told you nothing about *what to do*.)

Every open item below belongs to exactly one destination. When you finish a milestone, delete its
section rather than striking items through; the closed-item archive at the bottom keeps only
entries whose history is still load-bearing.

**Four kinds of thing live here, and they are not the same:**
- **Scheduled** — assigned to a milestone (M13–M20, Project 2, Launch → Production). Real work, real
  owner. Numbering was reset on 2026-08-02; see
  `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`.
- **Accepted** — a decision, not debt. Do not "fix" without re-opening the decision.
- **Watch-list** — correct today, revisit when a named trigger fires. Not scheduled on purpose.
- **Archive** — done or dead. Kept only where the reasoning still matters.

---

## Launch → Production

*The deploy itself. Not scheduled into a milestone — this is the launch phase on the v1 roadmap.*

- **Remove the component gallery at `/app/dev/components`** (M13). It ships in production unlisted
  and unlinked, rendering fabricated sample data only — deliberately, so the design system can be
  checked on a real device against the real CSP and the real font pipeline, which is where M5.5's
  font P0 hid. It has no place in a launched product. Delete the route, the page and its sample
  fixtures.
- **Email deliverability.** Dev uses Mailpit. Production needs a real SMTP provider with SPF, DKIM
  and DMARC, or verification, password-reset, invite and receipt mail lands in spam. **The entire
  auth flow depends on mail arriving** — an unverifiable account is an unusable one. Found
  2026-08-02; it had never been named anywhere.
- **Error monitoring and uptime.** There is none: no error tracking, no uptime check, no log
  aggregation. Today the discovery mechanism for a 500 at 6am is the box owner sending an email.
- **Measure the rate limits against a real class-opening rush.** `application.yml` says verbatim
  *"It has NOT been measured against a real class-opening rush — do that before launch."* That
  sentence existed **only in that comment**, in no backlog and no milestone. A whole gym shares one
  NAT IP, so a false 429 at midnight when classes open is a product failure, not a save.
- **Terms of service, privacy policy, and a DPA with boxes.** BoxHub is the processor and the box is
  the controller — documented internally, stated to nobody. EU gyms, real PII (names, emails,
  attendance, payments), real money. The pages themselves live with M19.
- **Verify DST transitions.** Box timezone drives week windows, the no-show sweep and day bucketing.
  Europe/Rome shifts twice a year and none of it is tested; M5.5 already shipped one UTC-vs-local
  bucketing bug.
- TLS/HSTS enforcement, domain, firewall, SSH hardening, Postgres backups **and a restore drill**,
  secrets delivery on the host, log retention, CI deploy on green. When TLS lands, set
  `BOXHUB_COOKIE_SECURE=true` in the host's `.env` (M12c added the variable and wired it through
  compose; the dev stack runs it `false` over plain HTTP).
- **Verify Google SSO end to end against real Google credentials on the real domain.** M12c proved
  the nginx routing and the `redirect_uri` *shape* — the dev stack runs a fake client id that
  reaches Google's consent screen and stops. Nothing yet exercises a real token exchange, the
  callback, or `GoogleLinkService`'s 4-branch linking policy against the live provider. Do this
  before the pilot, not during it.
- **`LogHygieneTest`'s PII guarantee only covers the surfaces it drives.** M12c redacted every
  address the test could actually see: `AuthController.LoginRequest`, `Mailer`'s two log lines,
  `InviteAdminController.CreateInviteRequest` and `CreatedInviteResponse`. Seven other DTOs carry an
  email field and are not driven by it — `AuthController.RegisterRequest` (still prints it in full),
  `UserResponse`, `SignupBoxResponse`, `MeResponse`, `MemberDto`, `SessionController.RosterEntry`,
  `InvitePublicController.PreviewResponse`, `SuperadminBoxController.WaitlistRow`,
  `InviteAdminController.InviteDto`. Redacting them blind is untested work; widening the test's
  driven surfaces is the real fix, and it belongs with log retention.

## Post-M13 · Frontend quality gates

*Both cut from M13 to keep it tight, both worth adding once the component library exists and has
stopped churning. Neither needs a new build pipeline — both ride the Playwright suite we already have.*

- **Visual regression on the component gallery.** Playwright's built-in `toHaveScreenshot()` over
  every component, both themes, three viewports, baselines committed. Catches unintended visual
  drift when a token or a shared style changes — exactly what happens during a rework. Deliberately
  not started in M13: baselines churn while components are still being designed.
- **Automated WCAG checks.** `@axe-core/playwright` asserting zero WCAG 2.2 AA violations on the
  gallery and the three shells. Design law v2 already *requires* AA; today it is reviewed by hand,
  not enforced. Expect the first run to find existing violations — the backlog already records two
  (`role="radio"` without roving tabindex on the RX/Scaled segmented control, and the sheet discard
  bar not moving focus on appear).

## The rework program — items by destination milestone

*The old "M12 · UX/UI rework" section is gone: it was one bucket for what is now eight milestones
(see `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`). Every item below kept its
wording and gained a home.*

### → M13 Foundations
- **Angular 19 → 22.** 19 is EOL; `npm audit --omit=dev` reports 6 high, all cascades of an SSR
  client-hydration CVE this client-rendered-only app cannot hit. When it lands: flip the per-push gate
  in `.github/workflows/ci.yml` to `--audit-level=high`, drop `continue-on-error` from the nightly
  informational step, and fold npm back into the OSV gate.
- Header CSS is ~90% duplicated across three shells; logout/theme placement differs per shell (athlete
  profile sheet vs coach/admin header ⎋). Fold into a shared shell.
- Unicode glyph icons (⎋ ⌘ ◐) read as a placeholder icon system — adopt a real icon set.
- Admin tables on phone are scroll-tables, not cards. *(`bh-data-table` card mode.)*
- RX/Scaled segmented control: `role="radio"` without roving tabindex/arrow keys; sheet discard bar
  doesn't move focus on appear. *(Fixed once in `bh-segmented` / `bh-sheet` rather than per screen.)*
- Sheet component: no focus trap beyond native `<dialog>`, no swipe-to-dismiss.
- Coach + admin surfaces are pre-rebuild: raw px type sizes, sub-44px targets, screens re-implementing
  `bh-*` input styles, no loading states. *(M13 supplies the components; each surface milestone applies them.)*

### → M14 Class model & schedule
- **Instance-builder save creates new `wod` rows on every edited re-save** — quick-created pieces become
  library wods each time, so the library grows unboundedly. The fix is dedupe-or-update-in-place, a design
  change to this screen's save model.
- **Day pager** (Book + coach Classes): no swipe, chevrons outside the thumb zone, no week-strip with
  availability dots — paging to the next open class can take 13 taps. 14-day bound.
- Builder score-type select is still a 5-option decision per scored piece.
- No coach-facing help for the skeleton → instance → publish flow.
- Drag-and-drop reorder + drag-to-move calendar slots (today: up/down + click-assign).

### → M15 Admin: people
- `members.page` search fires one request per keystroke — no debounce. *(`bh-search-bar` solves it.)*

### → M16 Admin: commerce
- `INVALID_PLAN` / `INVALID_MEMBERSHIP` (400 from `POST /api/box/subscriptions`) have no friendly copy.
- Mail templates duplicate the `#D7263D` accent hex across 4 files — centralise. *(Email clients can't
  use CSS custom properties, so this needs a build-time or template-fragment answer, not a token.)*

### → M17 Athlete
- Score form has no cancel/delete of a logged score (edit-only); no way to delete a lift entry.
- Booking error renders at the list top, not in the card foot next to the button that caused it.
- Leaderboard button could show score count ("3 posted"); score-save could show your rank ("you're 3rd")
  as the peak-end beat.
- `progression-chart` aria conveys count + best only, not per-point data (a table alternative exists below it).
- Shared leaderboard URL loses the WOD title (query param); leaderboard `track e.rank` breaks on tied ranks
  if the API ever ties.

### → M18 Superadmin
- Superadmin console per-row actions share one `queueActionId`/`boxesActionId` signal, so clicking approve
  on row A then reject on row B before A resolves re-enables A mid-flight (internal tool, duplicate-submit
  window).

### → M13 Foundations (auth & account screens)
*Ten screens, assigned to M13 on 2026-08-02 as the component library's first real consumer: login, signup, box picker, check-email, verify, forgot, reset, join,*
*account/security, account/email.*
- `verify.page` does not auto-select a box even with a single membership (pre-existing M8; the M9 e2e
  routes through `/auth/boxes` to work around it).
- join page: accept/register tail duplication; login link is a plain href, not `routerLink`; admin pages
  use `ngOnInit` without `implements OnInit`.

### → Project 2 The Room
- Score grid: no auto-advance to the next athlete, no Enter-to-save, no sticky clock while scrolling to
  Scores, Reset zeroes elapsed with no confirm, no hint text on EMOM/Tabata fields.
- Coach check-in long-press maps to contextmenu (desktop right-click); verify iOS Safari on a real device.
- Timer initial-GET has no distinct loading vs empty state.

### → Unscheduled chore
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

- **Types-page fan-out** (image/skeleton applied per weekly slot row) — a partial failure leaves slots inconsistent. Descoped from M12b: the suggested fix is making "class type" a first-class entity, i.e. a schema refactor rather than a bug fix.
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

- **`Membership.role`/`status` stay plain Strings rather than enums.** The DB already check-constrains both, behaviour would not change, and the edit churns many files. Retired from M12b as YAGNI.

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

**Closed by M12a (2026-07-27)** — the whole section is gone, all seven items resolved:
- ~~Per-test e2e DB isolation~~ — the three separately-filed symptoms had one cause. `e2e/tests/_support.ts`
  stamps every created entity with a run id. Proven by running the suite twice against the same stack with
  no reset, which fails before the change.
- ~~`runner.spec.ts` SSE flake~~ — measured first: delivery is 2.34s +/-18ms against a 15s budget, so latency
  was never the constraint. The spec now asserts the SSE frame arrived *before* asserting the clock
  rendered, so a failure names which half broke.
- ~~`TvStreamService` scope test~~ — the old test's comment called a wrong-scope token "impractical" to
  fake. It wasn't. Negative control: removing the scope check yields a 500 (a box token has no `device_id`),
  not a 401.
- ~~`box-settings` partial-patch branches~~ — timezone-only and logo-clear. Blank `logoUrl` maps to null,
  not `""` — the test asserts what the code does.
- ~~Join-fetch regression detector~~ — needed `entityManager.clear()` first, or the lazy proxy resolves from
  the L1 cache and the statement count is 1 either way. Negative control: `expected: 1L but was: 2L`.
- ~~Google race self-verification~~ — a counter on `GoogleLinkTx`, read via a method: direct field access
  NPEs because the bean is CGLIB-proxied and Objenesis skips the constructor on the proxy shell.
- ~~Register concurrent-race path~~ — **was never open.** `RegistrationTest` has raced it since M9
  (`5d86ecd`); the negative control was run against the *existing* test and it failed on `users_email_key`.
  The backlog entry was stale.

**Closed by M12c (2026-07-29)** — no Flyway; the whole section is gone, all four items resolved:
- ~~Google SSO unreachable behind nginx~~ — `/oauth2/` and `/login/oauth2/` proxy blocks, plus an
  explicit OAuth `redirectUri` built from `BOXHUB_APP_URL`. The second half was not in the backlog
  entry and would have left the button dead in production anyway: `CommonOAuth2Provider.GOOGLE`'s
  default `{baseUrl}` template resolves against the request, which behind nginx is plain http on an
  internal host. **`server.forward-headers-strategy` was tried first and rejected** — it installs
  `ForwardedHeaderFilter` globally, which rewrites `getRemoteAddr()` from the client-appendable
  `X-Forwarded-For` and re-opens the rate-limit IP spoofing M1-T9 closed;
  `RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket` caught it as 429 → 401. Negative
  controls: `http://localhost/...` for the redirect_uri, `Received: 200` (the SPA) for the routing.
- ~~compose `:-` secret fallbacks~~ — `env_file` + `docker/.env.example`, all `:-` removed from
  secrets, `docker/.env` gitignored, CI creates it. Proven by contrast: rendering the OLD compose
  file with no `.env` on disk exits 0 and prints the dev JWT secret, Stripe encryption key and media
  link secret in full; the new one exits 1 and renders nothing. `BOXHUB_COOKIE_SECURE` was added at
  the same time — it was set nowhere, so a prod deploy issued auth cookies without `Secure` over
  TLS. `deploy.sh` now refuses a `.env` carrying a DEV-ONLY value **or**
  `SPRING_PROFILES_ACTIVE=dev`, the latter because `DevDataSeeder` is the only `@Profile` bean and
  would seed four demo accounts, one superadmin, on a README-published password into production.
- ~~WebP EXIF gap~~ — WebP dropped rather than patched. TwelveMonkeys, the upgrade path the old
  `ponytail:` comment named, is reader-only and would have silently transcoded the user's file to
  JPEG. WebP appeared nowhere but the allowed-types map and two `accept` attributes.
  `uploadedJpegLosesExifGpsData` stayed green through the collapse, which is what made it safe.
- ~~Email addresses logged in DTO lines~~ — `Mailer` masks (`h***@t.io`, still enough to correlate a
  delivery failure with a member), and `LogHygieneTest` grew two address assertions plus two
  vacuous-pass guards. Found iteratively, each address traced to its source before being redacted:
  `LoginRequest.toString()` → `Mailer`'s `to=` → `CreateInviteRequest` (had no `toString()` at all)
  and `CreatedInviteResponse` (M11 had redacted its `link`, not its `email`). The guarantee's
  remaining limit is filed under Launch → Production above rather than fixed blind.

**Closed by M12b (2026-07-27)** — Flyway V16 and V17:
- ~~Drop the unwritten `memberships.expires_at`~~ — V16. No surviving reader in Java, JPQL or templates.
- ~~Self-serve owner cannot book their own classes~~ / ~~plan-less invitee cannot book~~ — both now get an
  ACTIVE no-expiry subscription on a per-box synthetic `Comped` plan, following V14's grandfather
  precedent (`subscription.plan_id` is NOT NULL, so a plan-less comp is impossible). Proven by tests that
  assert a real BOOKING, not the existence of a row.
- ~~Receipts compute the discount against the plan's CURRENT list price~~ — V16 adds
  `payment.list_price_cents`, snapshotted at both creation sites. Rows predating it stay NULL and the
  receipt OMITS the discount rather than inventing one.
- ~~`checkout.session.async_payment_failed` unhandled~~ — V17 widens the status check; the row goes
  PENDING → FAILED and the member is emailed, idempotently.
- ~~Box timezone unvalidated~~ — rejected on create AND patch (the brief named only patch).
- ~~`checkin`/`uncheck`/`no-show` 500 on a missing `bookingId`~~ — now 400. Fixed with a null check placed
  AFTER the guards, not `@Valid`: `@Valid` runs during argument resolution, so it would have returned 400
  to unauthorised callers and broken `AuthzConformanceTest`'s foreign-box probe.
- ~~`SuperadminAuditRepository` append-only by convention~~ — extends `Repository<>` now, so the guarantee
  is structural.
- ~~Member patch accepts a foreign `planId`~~ — **was never open.** `PatchMemberRequest(String role,
  String status)` has no `planId`; M10 removed it. The entry was stale.

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
