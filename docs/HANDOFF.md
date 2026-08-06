# rxed (formerly BoxHub) — Session Hand-off

**Updated:** 2026-08-06. Read this first, then the authoritative docs it points to. Everything here is current as of `main`.

## What BoxHub is
Multi-tenant CrossFit box platform: athletes book classes & track WODs, coaches program & run classes, box admins manage members/schedule, plus a TV whiteboard. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker Compose behind nginx, one VPS target. **Repo: `~/dev/boxhub`** (moved off the iCloud-synced Desktop on 2026-08-02 — that alone killed most of the ENVIRONMENT TRAPS below), GitHub `alelomo1998/boxhub` (private), CI green on push (`ci` + `dependency-scan` — check the run, a local green is not the gate).

## Authoritative docs (read in this order)
1. **`CLAUDE.md`** (repo root) — binding rules, loaded every session. Workflow + design + tenancy rules.
2. **Master spec / roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` — milestones M0–M7, operating rules.
3. **Design law:** `docs/superpowers/specs/2026-07-08-design-system-design.md` — binding for ALL frontend.
4. **Milestone specs+plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` (one spec + one plan per milestone).
5. **Backlog:** `docs/BACKLOG.md`. **Progress ledger:** `.superpowers/sdd/progress.md` — **now committed** (it was git-ignored until 2026-08-02, i.e. the recovery map lived on one disk, unversioned). Commit SHAs per task.
6. **Roadmap (current):** `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md` — M13a–M20 + Project 2. It **renumbers everything**; the old M12–M17 sketches are retired there with what absorbed each.

## Status — done and on `main`
- **M0 foundations** — auth (JWT access+refresh rotation), per-box role memberships, box-scoped tenant tokens, `TenantContext`, RFC7807 errors, Flyway V1, Angular shells + auth, Docker Compose, CI, deploy script.
- **M1 box core** — plans CRUD, invites (one-time hashed shareable link, no SMTP), public preview + accept, superadmin + box creation, member list/search/patch (last-admin guard), box settings, per-IP auth rate limiting, Hibernate `@TenantId`. Flyway V2.
- **Design system** — warm-dark "broadcast/heritage" identity. Token file is single source of truth; `bh-*` shared components; ThemeService (dark default). ALL existing screens restyled.
- **M2 scheduling & booking** — Flyway V3; class templates → auto-generated sessions (rolling horizon, `@Scheduled`); **BookingService** engine (session-row pessimistic lock, FIFO waitlist auto-promote, cancel cutoff, plan weekly-limit — no-oversell proven by concurrency test; **M10 moved the entitlement check onto the active subscription**); coach roster + check-in; nightly no-show sweep; athlete booking UI + coach sessions/roster + admin schedule; richer booking view (coach name + booked athletes); dev seeder now seeds a real weekly schedule.
- **M3 programming** — Flyway V4 (schema) + V5 (seed ~122 movements + 18 girls/heroes benchmarks); `com.boxhub.programming` package. **Hybrid WOD model** (typed top-level wod_type/score_type/time_cap + semi-structured `blocks_json` movement lines). **Box-configurable tracks** (`track` @TenantId, RX+Fitness seeded on box create via `TrackService.seedDefaults`). **Global copy-on-use benchmarks** (`benchmark_template` NON-@TenantId, cloned into box WOD w/ provenance). **Programming calendar**: `program_slot` unique (box,date,track), per-slot DRAFT/PUBLISHED, bulk publish. **Published-only WOD board** (athletes never see drafts — proven). Coach UI: WOD builder (movement-picker datalist) + library + week-grid calendar + benchmark browse/clone. Admin: tracks + custom-movement management. Athlete: **WOD board hero screen**. `movement`/`benchmark_template` are deliberately NOT @TenantId — explicit `box_id IS NULL OR = :box` filter (gotcha #1).
- **M4 tracking** — Flyway V6; `com.boxhub.performance` package. **Scores attach to `program_slot`** (`wod_score`, @TenantId, unique box+slot+membership). **Self-log only**: membership resolved from JWT via `findByUserIdAndBoxId`, never a param — an athlete can only write their own score, only against PUBLISHED slots. **Session leaderboard** (`Leaderboard.rank` pure fn): private omitted, RX block before scaled, ordered per score_type (TIME finished-asc then capped-by-reps, ROUNDS_REPS desc, LOAD desc). **Lift log** (`lift_entry`) with **auto-PR** (strictly-greater load per movement) + PR list + per-movement progression. **Benchmark history DERIVED** from scores whose slot.wod has a `benchmark_template_id`. Athlete UI: score logging + leaderboard peek on the WOD board; **My progress** page (benchmark PRs, lift PRs, inline-SVG progression chart — no chart lib, CSP-safe); lift-log entry. Board DTO now carries `slotId`.

- **Athlete surface rebuild (impeccable, 2026-07-10)** — phone-first app: bottom tab bar (Today/Book/Progress) + desktop rail; **Today hub** (WOD board + booked-class strip + score status, one red Log score action); score entry + leaderboard as native `<dialog>` bottom sheets (`bh-sheet`); Book folds in my-bookings; Progress folds in lift quick-log + PR celebration + fixed SVG chart. Reliability: loading states everywhere, saves have pending/inline-error with preserved values, prefill race fixed, input validation. A11y: `--faint` relit AA both themes, 44px targets (`--tap`), `--fs-*` type tokens, `--scrim`, focus rings, wired labels. Legacy routes `/athlete/{wod,my-bookings,lifts}` redirect. `PRODUCT.md` + `DESIGN.md` at repo root now anchor design work (impeccable init). Critique snapshots in `.impeccable/` (gitignored).

- **M5 Product UX overhaul (2026-07-10, branch `m5-ux-overhaul`)** — **class-centric model**: CLASS TYPE (`class_templates` + `template_piece` skeleton + `image_path`) → CLASS instance (`class_sessions` + `programming_status`) → ordered PIECES (`session_item` → `wod`; per-piece scoreable + score-type override; piece types +WARMUP/CIRCUIT/SKILL). Scores/leaderboards/history per item; **tracks + `program_slot` DROPPED (V7 — no prod data, demo reseeded)**. Media uploads (`POST /api/box/media` → docker volume, nginx `/media/**`, unguessable UUID paths, unauthenticated reads = pilot tradeoff). Athlete profiles (avatar upload, privacy = photo+name always), member-visible session detail (coach top + avatar grid Active/queue), announcement, home aggregate, admin KPIs, coach `uncheck`. FE: athlete tabs **Home·Book·WOD·Progress** (info-hub home, photo class cards + date pager, class detail → tappable athlete profiles, per-piece scoring via sheets); coach tabs **Classes·Build·Bench·Types** (photo check-in grid, skeleton-seeded instance builder mobile + desktop two-pane, types w/ image+skeleton editor); admin **SaaS shell** + KPI dashboard; `bh-avatar`. **Design law v2 codified** (CLAUDE.md + design-system spec) incl. the impeccable shape→critique≥28 gate.

- **M5.5 FE polish (2026-07-11, branch `m5-5-fe-polish`)** — rounder design language via radius token scale (`--r-ctl` 10 / `--r-card` 14 / `--r-lg` 20 / `--r-full`; `--edge` aliased to `--r-ctl`, design law §6 amended); desktop header nav (pill items) on athlete+coach shells (left rail gone; admin keeps SaaS side nav); floating pill dock (`.bh-dock` global styles) on mobile for all 3 shells; logout for coach/admin (header ⎋ + admin More sheet); modernized score sheet (`bh-sheet` --r-lg + `confirmClose` inline "Discard entry?" guard on dirty form, pill segmented RX/Scaled, display-font numeric inputs, toggle switches); lift quick-log labeled grid; coach Classes one-day-at-a-time via shared `bh-day-pager` (also Book); leaderboard promoted modal→hero page `/athlete/board/:itemId`; builder pre-locked skeleton types (+"change" unlock) + `unsavedGuard` canDeactivate + beforeunload. **Critique-driven fixes: P0 — brand fonts had 404'd since M5 (Angular dist `media/` shadowed by nginx `/media/` uploads location; now `bundle-media/` + e2e font smoke test). P1 — Book offered already-started classes; builder silently dropped untitled-with-content pieces (guard lied); Book bucketed days by UTC vs coach local.** Dead `bh-rail` deleted.

- **M6 TV display (2026-07-12, branch `m6-tv-display`)** — new `com.boxhub.display` package + Flyway **V8** `tv_devices` (deliberately NOT `@TenantId`; box scoping explicit). **Pairing:** TV opens `/tv` → `POST /api/tv/pair` returns 6-digit code + secret → TV polls `/api/tv/pair/poll` (202 pending → 200 `{token}` once claimed) → admin/coach claims via `POST /api/box/tv/claim {code,name}`; token is a long-lived (`scope:"tv"`, 400d, pilot tradeoff) HS256 JWT. **Device mgmt:** `GET/PATCH/DELETE /api/box/tv` (COACH|BOX_ADMIN, cross-tenant-denied; DELETE = REVOKED + emitter disconnect). **Realtime = SSE, not STOMP** (one-way, Fire Stick/smart-TV friendly, native reconnect): `GET /api/tv/stream?token=` holds an `SseEmitter`; pushes on connect, on `TvStateChanged` events (published from score save + coach check-in/uncheck/no-show), and a 30s `@Scheduled` sweep (+ `last_seen` heartbeat). `TvStateService.compose(boxId)` builds an idempotent snapshot **under `runAsBox`** (tenant-less reads of `@TenantId` entities fail open to root → would leak cross-box); draft programming is never broadcast, rail allowlists BOOKED/CHECKED_IN, private scores hidden. **FE:** `/tv` hero state machine (giant pairing code → 80/20 live board: WOD pieces left, coach + people/results rail right; idle clock; reconnect badge; forced dark) + admin **TVs** page (pair by code, online-state list, remove). nginx `/api/tv/stream` passthrough (`proxy_buffering off`, `read_timeout 1h`). Emitter-completion race guarded (revoke vs concurrent push can't 500 the writer).

- **M7 coach class runner core (2026-07-13, branch `m7-class-runner`)** — the coach runs a class from one screen. Flyway **V9** (`wod_score.logged_by`; `class_timers` `@TenantId`, one per session) + **V10** (`spec_json` jsonb→text — Hibernate binds a String as varchar). **Coach score entry:** `POST /api/box/sessions/items/{itemId}/score/{membershipId}` (staff, target membership validated in-box, `logged_by`=coach; athlete self-log path untouched). **Server-authoritative timer** (`display.TimerService`): `GET/POST /api/box/sessions/{id}/timer` arm→start→pause→resume→reset; server persists `{spec, startedAtEpoch, pausedElapsedMs, status}` and NEVER ticks — clients compute elapsed and render locally; every transition publishes `TvStateChanged` → the M6 SSE pushes `TvState.timer`. **Runner** `/coach/classes/:id/run` (three zones: roster strip reusing the M5 check-in grid, timer arm/control with a local clock, per-piece coach score grid — optimistic paint + per-cell retry). **TV** grows a giant-timer takeover (left 80% = clock via the shared pure `renderTimer` + timed-piece caption; 20% rail stays; board returns when the timer clears). **Shared `ui/timer.ts renderTimer`** drives coach + TV identically for all four types (For Time/AMRAP/EMOM/Tabata), reconnect-safe from the clock. Fixed a latent M5.5 bug found by the gate: coach Classes now reaches 14 days (was 7) so a weekly class up to 7 days out is check-in-able.

- **M8 auth & accounts (2026-07-17, branch `m8-auth-accounts`)** — accounts are real now: verified, recoverable, revocable, un-stealable. Flyway **V11** (`users.email_verified`/backoff cols + nullable `password_hash`; `auth_identity`; `email_token`; `refresh_tokens` families) + **V12** (`users.anonymized_at`). **Tokens moved to httpOnly cookies** (`bh_at`/`bh_bt`/`bh_rt`) behind a custom `CookieBearerTokenResolver` (header first, cookies second — so the 159 pre-M8 header tests and the TV token stand untouched); **CSRF** via `CookieCsrfTokenRepository` (a cookie-authed write needs `X-XSRF-TOKEN`; bearer-header requests are exempt). **Refresh families + reuse detection** — a replayed consumed token revokes the whole family; nightly purge job. **Email verification**: login checks the password FIRST, only then answers `EMAIL_NOT_VERIFIED`, so it is not an enumeration oracle; `register` always returns 201 (a taken address mails the real owner instead) and the 201 body is built from the request only. **Password reset** verifies the email + revokes every session. **Per-account exponential backoff** (never a hard lock), **per-email** limits on forgot/resend, **HIBP** breached-password check (min 10, fails open). **Google SSO** — a 4-branch linking policy that closes the pre-registration takeover (an unverified local account loses its password to Google); the whole OAuth chain is conditional on a client id, so dev/CI need no secrets, and it lives in its own `@Order(1)` filter chain because oauth2Login needs a session. **Account management**: change password (revokes other sessions), change email (confirmed at the NEW address), sessions list + log-out-everywhere at **`GET /api/auth/sessions`** (under `/api/auth` because `bh_rt` is `Path=/api/auth`). **GDPR**: `GET /api/me/export` + anonymizing `DELETE /api/me` (scrubs the person, keeps the box's history; explicit `anonymized_at` state; re-auth with the password when one exists). **Invites are actually emailed** now (T11), and an invite proves the inbox — registering through a valid invite for that address lands verified. **SMTP + Thymeleaf + Mailpit** foundation. FE: tokens leave `localStorage` (AuthService is a session mirror bootstrapping from `/api/me`); 6 new auth screens (signup/check-email/verify/forgot/reset + Google) and the account **security** panel. e2e journey signs up and follows the verify link out of a real Mailpit inbox.

- **M9 onboarding (2026-07-19, branch `m9-onboarding`)** — a box no longer needs a superadmin to exist. Flyway **V13** (`boxes.status` PENDING/ACTIVE/SUSPENDED/REJECTED + `owner_email`; `platform_settings` key/value seeded `signup_mode=APPROVAL`/`max_boxes=100`; `waitlist`). **`POST /api/auth/signup-box`** (permitAll, rate-limited) registers the owner + box + BOX_ADMIN membership as one atomic unit — same `RegisterTx`/`BoxSignupTx` proxied-unit pattern M8 needed for the aborted-tx trap, now with a bounded 3-attempt taken-vs-slug retry that gives up with a 503 `SIGNUP_RETRY` rather than looping forever; OPEN activates instantly, APPROVAL/at-cap parks the box PENDING or the signup on the waitlist. **Status gating**: a PENDING box preps freely (class types, schedule, settings) but box-token mint, invite-create, and TV pair/claim 403 `BOX_PENDING`; SUSPENDED 403s box-token mint itself (kill switch) and disconnects any live TV stream — side effects strictly post-commit, same house rule M9-T4's review enforced on M8's mail. **Superadmin console** `/superadmin` (guarded on the session's `superadmin` flag, still the `BOXHUB_SUPERADMIN_EMAILS` allowlist; new dev user `super@demo.io`, no box): pending queue (approve → ACTIVE + `box-approved` mail, reject → REJECTED + `box-rejected` mail), all-boxes suspend/reactivate, waitlist view, signup-mode/max-boxes settings (validate-then-write — no half-applied flip). **FE**: public `/auth/start` (open form or waitlist form, mode resolved live from `signupMode()`), admin-shell PENDING banner + dashboard setup guide (step 3 locked until ACTIVE), invites/TVs pages swap to a locked card under `BOX_PENDING`. e2e (`onboarding.spec.ts`) drives the whole loop through a real Mailpit inbox: signup → verify → PENDING banner + locked invites → superadmin approves from the pending queue → approval mail lands → owner signs back in → invites unlock → invite mail lands.

- **M10 memberships & payments (2026-07-21, branch `m10-memberships-payments`)** — a box sells memberships. Flyway **V14**: `plans` gain `price_cents`/`currency`/`entitlement` (`UNLIMITED`|`WEEKLY_LIMIT`), new `subscription` / `payment` / `box_stripe`, and **`memberships.plan_id` is DROPPED**. **`subscription` is now first-class** between a membership and a plan: plans carry a **list** price, each subscription carries the **agreed** price (+ optional note), so a box discounts per athlete. **Booking follows the active subscription** — `BookingService.entitlementBlocked` 409s `NO_ACTIVE_SUBSCRIPTION`, allows `UNLIMITED`, and keeps the pre-M10 Mon–Sun box-timezone count verbatim for `WEEKLY_LIMIT`; **a lapse blocks only NEW bookings** (check-in/cancel/no-show/waitlist-promotion untouched, now pinned by a test). **Grandfathering**: V14 gives every pre-existing membership a no-expiry ACTIVE subscription so nobody lost booking on deploy; a standalone `MigrationGrandfatherTest` (own Testcontainer, programmatic Flyway 13→seed→14) proves it per-box. **Two payment rails**: (1) **Stripe Checkout** on the box's OWN restricted key — `CryptoService` AES-GCM at rest (`BOXHUB_STRIPE_ENC_KEY`, **no default — a missing key fails startup**), `GET/PUT/DELETE /api/box/stripe` returns `{connected}` only, never key material; `POST /api/stripe/webhook` is permitAll + CSRF-exempt and **signature-verification is its entire security boundary** — raw bytes, box resolved from our OWN Payment row (not unverified JSON), all `@TenantId` work inside `runAsBox` with the tenant set BEFORE the tx opens, idempotent on `stripe_session_id`, **and gated on `payment_status == "paid"`** (+ `async_payment_succeeded`) so a delayed SEPA/bank-transfer session never grants membership before the money settles. (2) **Admin-recorded** `CASH|TRANSFER|CARD|OTHER` at the amount actually collected (`STRIPE` rejected there). `DELETE /api/box/subscriptions/{id}` cancels (frees the single-ACTIVE slot — plan switching needs it, `SWITCH_REQUIRES_CANCEL`). **Receipts** at `GET /api/box/receipts/{paymentId}` (payer or admin only) + a printable `/receipts/:paymentId` page, emailed on both rails **after commit**. Nightly `SubscriptionLapseJob` flips ACTIVE→EXPIRED and mails (cross-box: iterates boxes under `runAsBox`, since the derived query is `@TenantId`-filtered). Invite-accept creates an ACTIVE subscription (no Payment row — they haven't paid). **Money is integer cents everywhere; `€xx.xx` only at the FE edge.** FE: admin plans pricing, record-payment, Stripe connect, athlete membership (Subscribe gated on `stripeAvailable`), receipt page.

- **M11 security hardening (2026-07-26, branch `m11-security-hardening`)** — the whole surface hardened to a public-launch bar (hostile internet **and** hostile tenants), with tenancy proven by a standing automated guarantee instead of a one-time audit. **The spine is `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java`**: it enumerates Spring's own route table and, per route, asserts anonymous denial, foreign-box denial against a **real seeded box-A resource** (not a random UUID — that was T1's hollow version, proven hollow by a negative control), a positive control that box A's own admin is NOT denied (else the denial proves only "unknown id"), insufficient-role denial incl. COACH, and for collection GETs that box B **reaches 2xx and sees zero of box A's rows**. Default is deny: a route that is neither allowlisted (METHOD+pattern, each with a written justification) nor assigned a minimum role **fails CI**, so a later milestone cannot quietly ship an unguarded endpoint. Coverage extends past `/api/box/**` to `/api/admin/**`, `/api/me/**` and authenticated `/api/auth/*`. Four holes were injected and observed failing, then reverted. `KNOWN_GAPS` was **deleted, not emptied** — T1's 7 "gaps" were instrumentation artifacts (the probe sent `{}`, so `@Valid` 400'd before the imperative `RoleGuard` ran); a well-formed body cleared all 7, and **no authz re-architecture was done**. **Confidentiality:** media reads are now signed short-lived URLs (`MediaSigner` mints `?md5=&expires=`, nginx `secure_link` validates — verified live across the container boundary: unsigned 403 / expired 410 / valid 200) with EXIF stripped on upload; every stored path that feeds the signer is validated to be the caller's own box first (an unvalidated one is a capability to read another tenant's file), and the TV re-signs fresh on every SSE push. The box logo is not signed, but that is a no-op rather than a carve-out: it is an operator-typed absolute URL, never an upload — if it ever becomes one, it needs a decision, since the spec calls the logo public so it can render pre-login on the invite preview. The TV's 400-day token moved off `?token=` into a `bh_tv` httpOnly cookie. **Secrets:** `SecretDefaultsTest` fails the build if any secret-shaped property (yml *or* `@Value`) regains a usable default; `BOXHUB_STRIPE_ENC_KEYS` is now a versioned `version:base64key` list (ciphertext prefixed `v{n}:`, legacy unprefixed rows still decrypt, so rotating needs no re-encryption); `LogHygieneTest` paid for itself immediately by catching Spring MVC logging **every user's plaintext password** and live Stripe credentials via record `toString()` (13 redactions across 5 files, plus two response-side leaks). Superadmin lifecycle actions get an append-only audit log (**Flyway V15**) written *inside* the transaction — the inverse of the mail rule. `DELETE /api/auth/sessions/{familyId}` kills one session (404, never 403, for another user's id). **Hygiene:** rate limits extended by Ant-pattern matching to invite creation, media upload, checkout, booking and the public invite-preview/receipt lookups, plus a global per-IP ceiling; a nightly `PurgeJob` sweeps refresh tokens, email tokens, invites (native SQL) and stale PENDING TV pairing codes; five security headers + a strict CSP with an nginx-injected Angular nonce, proven in a real browser with **zero** violations; OWASP dependency-check nightly + Dependabot + `npm audit` per push. `docs/TENANCY.md` is new and binding.

    **The dependency-scanning criterion is met**, via OSV-Scanner rather than the OWASP plugin the spec named: it gates every push with no credentials, where the plugin could only run nightly behind an NVD API key. The frontend gate is `--audit-level=critical --omit=dev` rather than `high`, because every current high is a cascade of Angular 19's SSR-hydration CVE that this client-rendered-only app cannot hit, and the only fix is the 19->22 upgrade M12 owns.

- **M12a test & CI reliability (2026-07-27)** — the e2e suite runs with **`retries: 0`**. `retries: 1` had been load-bearing, which is how a flaky spec taught everyone to re-run red pipelines without reading them. Per-run data isolation (`e2e/tests/_support.ts` stamps every created entity; `login()` deduped out of 8 specs) replaced it, proven by running the suite twice against the same stack with no reset. The `runner.spec` SSE flake was *measured* before being fixed (2.34s ±18ms against a 15s budget — latency was never the constraint) and the spec now asserts the frame arrived before asserting the clock rendered. Five coverage gaps closed, each verified by breaking the implementation and watching the test fail; a sixth turned out to have been covered since M9.

- **M12b correctness & data integrity (2026-07-27)** — **Flyway V16 + V17**. The two membership routes that produced members who could not book (self-serve owner, plan-less invitee) now get an ACTIVE no-expiry subscription on a per-box synthetic **`Comped`** plan — `subscription.plan_id` is NOT NULL, so V14's grandfather synthetic-plan precedent is followed rather than inventing a nullable plan. Receipts snapshot `payment.list_price_cents` at payment time and **omit** the discount for older NULL rows instead of computing one against today's price. `async_payment_failed` resolves the row to FAILED and emails the member, idempotently. Timezone validated on create + patch; the three booking endpoints return 400 not 500 on a missing `bookingId`; `SuperadminAuditRepository` is append-only **by type** now. Three backlog items were descoped with reasons and one was already fixed by M10.

- **M12c production readiness (2026-07-29)** — the gap between "the code is correct" and "what runs on a VPS is correct". No Flyway. **Compose secrets now fail closed**: `env_file` + committed `docker/.env.example` (gitignored `docker/.env`), every `:-` fallback gone. The old file rendered the dev JWT signing key, Stripe encryption key and media link secret in full with no `.env` on disk — compose interpolation resolves *before* Spring sees a placeholder, so `SecretDefaultsTest` could not see it. `BOXHUB_COOKIE_SECURE` was set **nowhere**, so a prod deploy issued `bh_at`/`bh_bt`/`bh_rt` without `Secure` over TLS; it is wired now. `deploy.sh` refuses a `.env` carrying a DEV-ONLY value **or** `SPRING_PROFILES_ACTIVE=dev` — `DevDataSeeder` is the backend's only `@Profile` bean, so that flag alone would seed four demo accounts, one superadmin, on a README-published password into production. **Google SSO reaches Spring at last**: `/oauth2/` and `/login/oauth2/` nginx locations (dead since M8), plus an explicit OAuth `redirectUri` from `BOXHUB_APP_URL` — `CommonOAuth2Provider.GOOGLE`'s default `{baseUrl}` template resolves against the request, which behind nginx is plain http on an internal host. A fake dev client id makes the chain live so e2e can assert the routing. **WebP uploads dropped** rather than patched (no JDK codec, so the decode/re-encode EXIF strip could not run and files were stored byte for byte; TwelveMonkeys is reader-only and would have silently transcoded to JPEG). **Member addresses out of the logs**: `Mailer` masks (`h***@t.io`), `LoginRequest`/`CreateInviteRequest`/`CreatedInviteResponse` redact `email`, and `LogHygieneTest` grew two address assertions with their own vacuous-pass guards.

- **M13a baseline (2026-08-02)** — the first milestone of the rework program (see `docs/superpowers/specs/2026-08-02-v2-roadmap-rework-program.md`, which renumbers everything). Three baselines moved with **zero visual change**, which was the milestone's defining constraint and what made it verifiable at all. **Angular 19.2 → 22.1.0** (+ TypeScript 6.0.3), one major at a time, each fully gated. **Karma and `zone.js` retained** — the planned Vitest migration was *cut* after verifying directly against the published package that `@angular-devkit/build-angular@22.1.2` still ships a `karma` builder with a `karma ^6.3.0` peer dependency; the claim that Angular 22 removes Karma came from a secondary article that had also invented a migration schematic that does not exist. **The app moved under `/app`**, with `AppUrls` splitting `boxhub.app-url` into an origin and an app-base — `Mailer.link()` and the Stripe return URLs take `/app`, the OAuth `redirect_uri` must **not**, because nginx proxies `/login/oauth2/` at the server root and Google matches a console registration. Old app paths keep **permanent 301s** preserving query strings and path parameters, because verification/reset/invite links already in real inboxes carry single-use, time-limited tokens. **Opt-in local HTTPS** (`--profile tls`) finally exercised `BOXHUB_COOKIE_SECURE`, wired in M12c and never once proven: `Secure` present with it true, gone with it false, everything else identical. **Flyway V18** adds `users.locale` + `boxes.locale`. **i18n infrastructure** (`@angular/localize`, runtime `loadTranslations`, `LOCALE_ID`, locale-aware formatting) plus a brand constant on both sides — the ~390 existing strings were deliberately **not** marked, since M13c–M18 rewrite those screens; that obligation is now a binding rule in `CLAUDE.md`.

**Tests (M13a, 2026-08-02):** backend **428** (Testcontainers Postgres, 0 skips), frontend **184** Karma specs, e2e **28** Playwright (SERIAL — `workers:1`, **`retries: 0`**). All green. Impeccable critiques M5.5 **28/40** · M6 **32/40** · M7 (runner+TV timer) in `.impeccable/critique/` — zero open P0/P1. Remaining polish is in `docs/BACKLOG.md`, which is now organised by DESTINATION (M12/M15/M17/Project 2), not by origin milestone.

- **M13b design language (2026-08-06)** — chalkboard-black-and-volt replaces the warm-broadcast
  identity, **dark only**, and the product is renamed **BoxHub → rxed** (`rxed.app`). Design law v3:
  `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`, which supersedes the M5 design
  law in full (its accessibility/process rules — state never silent, WCAG AA, `bh-sheet` overlays, the
  impeccable gate — survive verbatim in §11–§12). Token *names* are unchanged, so every existing
  screen recoloured automatically; only `--red`/`--on-red`/`--red-glow` were renamed to
  `--volt`/`--on-volt`/`--focus` across 53 files, and error states were split off onto a new
  `--danger` (may fill a button or chip, never a row/card/panel). `ThemeService`, `data-theme`,
  `prefers-color-scheme` and the light theme are **deleted** — re-open trigger: a pilot box asks, or
  an accessibility need surfaces. Faces: Saira Condensed deleted; Archivo (400/500/700/800) +
  JetBrains Mono (400/700), where mono is now the "prescription voice" and is **banned from prose**.
  Focus rings became solid 2px outlines, inverting to `--focus-inv` on volt-filled controls (a volt
  ring on the volt primary button is invisible). The wordmark is type, not an asset (`bh-wordmark`
  component), plus a hand-drawn SVG favicon. Two proof screens — the WOD board and the admin members
  table — prove both halves of the language at a new dev-only route, `/app/dev/components`, with an
  automated spec asserting the "one volt element" rule rather than trusting it by eye. **No product
  screen was redesigned**; existing screens recolour automatically and some look wrong on purpose,
  fixed in their own rebuild milestones (M13c–M18). The receipt page's print stylesheet, broken since
  M10 (prints near-white text on white paper), now inverts to ink-on-paper. Two clarifications landed
  mid-milestone, both in the spec: §2.3 ("volt is the only accent") was reworded from a raw count to a
  rule about *questions*, after the WOD board proof caught volt being spent on a score-type label; §3.1
  was amended so `--danger` may fill a button or chip after all, for the delete-account confirm case.
  **Tests:** backend **428** / frontend **182** (down from 184 — Task 2 deleted `theme.service.spec.ts`
  and `app.config.spec.ts`'s theme assertions; Tasks 9–10 each added one proof spec) / production build
  clean, with three pre-existing `anyComponentStyle` budget warnings (`instance-builder.page.ts`,
  `tv-shell.page.ts`, `progress.page.ts`, filed in `docs/BACKLOG.md`, fixed by each screen's own
  rebuild milestone, not by raising the budget). **e2e 28/28** at `retries: 0` against a
  `down -v` rebuilt stack.

  **The e2e run earned its keep twice.** `theme.spec.ts` failed correctly — it pinned the retired
  warm ground and the deleted `data-theme` attribute — and rewriting it exposed that its *sibling*
  had been hollow all along. The font guard added after M5.5's P0 (brand faces 404'd in production
  for a whole milestone) called `document.fonts.check('800 20px "Saira Condensed"')`, and that call
  returns true whenever the string is renderable **including by a fallback**. It passed for the
  entire milestone while asserting a typeface deleted in M13b's first commit, and it could never
  have detected the bug it was written to catch. Now uses `document.fonts.load()`, which resolves to
  an empty array for an undeclared family, with a permanent negative control asserting Saira
  Condensed returns zero faces.

- **Post-M7 fix on `main` (2026-07-14, `cbb0fbb`):** nginx serves `index.html` with `Cache-Control: no-cache` so a frontend rebuild (new content-hashed chunk names) never leaves a stale cached `index.html` pointing at gone chunks (was causing "module MIME text/html" load errors after `--build`). Also: recurring untracked macOS "` 2`" Finder-duplicate files (e.g. `TimerService 2.java`) regenerate in the working dir and break the LOCAL docker build (duplicate class); committed tree is clean, so a fresh clone/CI is fine — `find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete` before a local `docker compose build` if it fails on dup classes.

## Roadmap — SUPERSEDED by the v1 roadmap (2026-07-14)
**Read `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.** It replaces the old M7.5/M8/M9 sketch.

**Product thesis (drives everything):** a box does not switch for the booking — they already have booking. They
switch for **the room** (the board on the wall + the controls in the coach's hand). So: **plumbing correct and
unremarkable; the room extraordinary.**

**Structure = two projects + a launch.**
- **Project 1 — The Platform** (table stakes, lean + flawless): **M8** auth & accounts (email/SMTP, verification,
  password reset, revocation, **Google SSO**) → **M9** onboarding (self-serve "Start your box", box status,
  100-box cap, superadmin console) → **M10** memberships & payments → **M11** security hardening → **M12** FE rework
  (**excludes the TV board — Project 2 owns it**) → **M13** analytics (lean).
- **Project 2 — The Room** (the wedge; own roadmap doc, brainstormed when P1 lands): field research in real boxes →
  the board → the director (coach's control surface) → heats/teams/theater → hardware + **sound**. Absorbs the old
  "M7.5 TV command".
- **Launch:** production (VPS, no k8s) → marketing site → **pilot** (real box, 2 weeks, complete product,
  bug-fix only) = **v1.0**.

**Binding rules:** no deadline — correctness and solidity beat speed at every decision point; "faster to build" is
never an argument. Pilot = the launch, not a learning exercise.
**Locked scope:** free 2–3 months / ~100-box cap; athletes pay boxes via **the box's own Stripe keys** (no Connect,
BoxHub never touches funds) + cash/transfer with a manual receipt; Google SSO in M8; no Kubernetes.

- **Onboarding (M9) is complete** — spec `docs/superpowers/specs/2026-07-18-m9-onboarding-design.md`, plan `docs/superpowers/plans/2026-07-18-m9-onboarding.md`. See the Status section above for what shipped.

## What's NOT done (next)
- **M7.5 TV command** — manual per-device view selection (this TV = board / leaderboard / timer). Seam ready: add a `view` column to `tv_devices`; M7 auto-drives all TVs identically (timer takes over while running). **User confirmed this is genuinely needed (not polish) — auto-driven-only TVs aren't realistic for a multi-screen box.**
- **Heats/teams** — split the roster into n heats/teams + a team score model; the runner's roster strip is where it slots in (deferred from M7).
- **M8 full SaaS analytics** — economics, engagement, class stats (admin dashboard shell + 3 KPIs shipped in M5). Note: speculative before real pilot usage exists.
- **M9 hardening & pilot.** VPS never deployed (only runs locally).
- **BACKLOG.md** items: no server-side logout/revocation, no purge job for expired refresh_tokens/invites, rate-limit is per-node in-memory, media reads unauthenticated, TV stream token in query param, member-list N+1, and the **@TenantId native-query audit** (see gotchas). `TODO` in spec §6: member export + hard delete.

## Architecture
- **Backend:** modular monolith, package = module boundary under `com.boxhub`: `identity` (users/auth/memberships), `box` (boxes/plans/invites/templates/sessions/bookings), `shared` (tenancy/errors/RoleGuard/rate-limit/seeder). `programming`, `performance`, `display` packages will come with M3–M5.
- **Multi-tenancy:** single DB, `box_id` on every tenant table, Hibernate 6 `@TenantId` discriminator resolved from the JWT `box_id` claim via `shared/TenantIdentifierResolver` + `TenantContext`. Null tenant = fail-OPEN "root" (documented in ADR-001 amendment) — safe only because `/api/box/**` requires `SCOPE_box`. Every box endpoint has happy + auth-denied + cross-tenant-denied tests (mandatory).
- **Auth:** stateless JWT (HS256), user token → box token (after ACTIVE-membership check) → box-scoped requests. Superadmin via config allowlist claim.
- **Frontend:** Angular standalone + signals. `src/styles/_tokens.scss` = ONLY place raw color/type/spacing live. `src/app/ui/` = `bh-*` components (button, field, pill, tag, stat, board-row, panel, rail/nav, wordmark; `.bh-table` styles). Screens in `src/app/features/{auth,admin,athlete,coach,tv,join,booking,dev}`. `core/auth` (AuthService+interceptor+guards). **No `core/theme`** — `ThemeService` and the light theme were deleted in M13b; dark only.
- **Booking engine** (`box/BookingService`): every state transition `@Transactional` under `ClassSessionRepository.findWithLockById` (SELECT … FOR UPDATE). Cancel = DELETE the booking row (not a CANCELLED status); CHECKED_IN/NO_SHOW persist. Reason codes returned as `ResponseStatusException(409, "CODE")` → problem+json `detail`.

## CRITICAL gotchas (these bit us repeatedly)
1. **@TenantId silently filters JPQL/derived queries AND bulk updates.** Any query that must be tenant-agnostic (lookup by unguessable token, cross-box job) MUST be NATIVE SQL. Bit us on invite `findByTokenHash` + `burnIfUnaccepted`. **Audit before adding tenant-agnostic access to a @TenantId entity.**
2. **System-level writers of @TenantId entities have no tenant** (schedulers, seeder). Set a synthetic box tenant (JwtAuthenticationToken with `box_id` claim, `SCOPE_box`) **BEFORE the transaction opens** — open the tx via `TransactionTemplate` INSIDE the tenant scope, else `@TenantId` resolves to the all-zeros sentinel → FK violation. See `box/SessionGenerator.runAsBox` and `shared/DevDataSeeder`.
3. **`@Transactional` on a test method** binds the Hibernate session before auth is set → sentinel tenant. Don't; wrap only the locking call in a `TransactionTemplate` after `actAsBox`.
4. **Lazy `User` on `Membership`** (OSIV off): endpoints resolving athlete/coach names need `@Transactional(readOnly=true)` to keep the session open.
5. **Build env:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` for all backend mvn (system JDK is 26, too new for Boot 3.4). Testcontainers pinned `1.21.4` (older pins Docker API v1.32, rejected by local Docker 29). Node 26 warns for Angular 19 — ignore.
6. **e2e is serial** (`e2e/playwright.config.ts` workers:1) + retries:1 — it shares one seeded backend; parallel caused flake. **The "cold-start flake" was actually the auth rate limit:** the serial suite fires >10 logins/min from one IP, tripping the strict prod default of 10 → 429 cascade. Fixed in M3 by `BOXHUB_AUTH_RATE_LIMIT=200` in the dev/e2e compose backend env (prod overrides strict). If you add more logging-in specs, this is why.
7. **Cookies + CSRF (M8).** A cookie-authenticated write needs the `X-XSRF-TOKEN` header (client GETs `/api/auth/csrf` once to seed the cookie); MockMvc tests need `.with(csrf())`; a bearer-`Authorization`-header request is CSRF-exempt by design. Two traps: (a) `.with(csrf())` reflectively swaps the singleton `CsrfFilter`'s tokenRepository and never restores it, poisoning later tests in the same context that need the real cookie repo — `CookieAuthTest` has a `@BeforeEach` reset. (b) Spring's own `STATELESS` config adds `SessionManagementFilter` with a `NullSecurityContextRepository`, which made `CsrfAuthenticationStrategy` delete the XSRF cookie on every request (login worked, then `box-token` 401'd — nobody could pass the box picker); fixed by `.securityContext(...RequestAttributeSecurityContextRepository)` in `SecurityConfig`. Both fixes are coupled to Spring Security 6.4.2 internals — re-verify on any upgrade.
8. **MockMvc does not enforce RFC 6265 cookie `Path` matching (M8).** A cookie-path/endpoint mismatch passes green in MockMvc and fails only in a real browser — it shipped once. `bh_rt` is `Path=/api/auth`, which is exactly why sessions live at `/api/auth/sessions`, not `/api/me/sessions`.
9. **Every emailed link must match a real Angular route (M8).** Three shipped dead because the backend built bare paths (`/verify?token=`) while the routes are namespaced `/auth/*`, and `/join` is a `:token` path param not a query. `e2e/tests/auth.spec.ts` follows the real link out of Mailpit — that is what catches this class of bug; MockMvc/Karma cannot.

## GATE GAPS — what each gate does NOT catch (learned the hard way)
- **`npx tsc --noEmit -p tsconfig.spec.json` does NOT run Angular's strict TEMPLATE type checking.** M12b
  shipped `r.listPriceCents / 100` on a `number | null` past a green tsc; only `ng build --configuration
  production` caught it (`NG1: Object is possibly 'null'`), and it broke the Docker image build. If you
  touch a template binding's nullability, run the real production build.
- **tsc is also blind to runtime test defects** — an unflushed `HttpTestingController` expectation passes
  tsc and fails Karma (M12a shipped two of those).
- **The backend suite cannot see cross-feature product regressions.** M12b's comp subscription passed 405
  backend tests and still blocked the admin from recording a member's first payment; only e2e caught it.
  A green unit suite is not evidence the feature works.
- **No test reads the infrastructure files.** `docker/docker-compose.yml`, `docker/nginx.conf` and
  `deploy/deploy.sh` are where M12c's two live bugs lived, and both had survived M11's security
  sweep for exactly that reason: a property enforced in Java can be silently undone one layer up,
  by the thing that starts the JVM. `SecretDefaultsTest` proved `application.yml` had no usable
  secret defaults while compose supplied them anyway. When you change one of those three files,
  the gate is a contrast you run by hand — render the old and the new and diff what leaks.
- **A one-line config change is not a local change.** M12c's `server.forward-headers-strategy:
  framework` was one line in `application.yml` to fix an OAuth redirect_uri, and it installed a
  global Spring filter that rewrote `getRemoteAddr()` from the client-appendable `X-Forwarded-For`,
  re-opening the rate-limit IP spoofing M1-T9 closed. Neither the design nor the new test saw it;
  `RateLimitTest` did, as 429 → 401. Run the full suite even when the diff looks trivial.

## ENVIRONMENT TRAPS — MOSTLY DEAD as of 2026-08-02 (repo moved off iCloud)

**The repo now lives at `~/dev/boxhub`, not `~/Desktop/boxhub`.** It was on an iCloud-synced Desktop
until 2026-08-02, and that single fact was the root cause of nearly every trap this section used to
list. They were re-measured after the move rather than assumed dead:

| Trap | On iCloud | Measured at `~/dev` (2026-08-02) |
|---|---|---|
| `rm -rf backend/target` before every `mvn` | 40s suite → **9:59** without it | **102s, no clean, no ritual** |
| `ng test` | **~1 hour**, silent throughout | **13 seconds**, 184/184 |
| `"* 2.java"` Finder duplicates breaking Docker builds | recurring | **0 files** |

**The `ng test` number is the one that matters.** ~1 hour → 13 seconds is roughly 277×, and the
slowness was never Karma — it was iCloud materialising dataless files on every read. That belief is
what this document used to cite as the reason M11 T5/T7/T8 shipped on `tsc` alone, and how two broken
console specs reached `main`. **The frontend gate was always usable. The filesystem was lying about
it.** Run `npm test` on every frontend change now; there is no longer any excuse not to.

**Caution for whoever moves a repo off iCloud again:** `find . -name "*.icloud"` returning zero does
**not** prove the tree is local. Modern macOS uses APFS dataless files carrying the real filename, so
that check is worthless. The tell is behavioural — during a `mv`, the *source* directory grows while
the destination stays empty. Moving with `mv` also forces every evicted file to download first, so a
`git clone` to the new path is far better: it was 7.4 MB against a tree materialising toward 6 GB.
Copy the gitignored keepers by hand afterwards (`docs/design-md`, `.impeccable`, `docs/reference`,
`docker/.env`).

### After a fresh clone — `npx playwright install chromium`

`npm ci` in `e2e/` installs Playwright but **not** its browser binary, and the failure is loud but
easy to misread: every browser-driven spec dies in ~1ms with
`browserType.launch: Executable doesn't exist`, so a 27-spec suite reports **17 failed, 9 did not
run, 1 passed**. That looks like the application is catastrophically broken. It isn't.

The single spec that passes is the SSO routing assertion, because it uses Playwright's `request`
fixture and never opens a browser — which is a useful diagnostic in itself: *only* the
browserless test passing means the browser, not the app.

### Still true, and not iCloud's fault

1. **Never pipe a gate through `grep`/`tail`.** The pipeline buffers, so a *working* run produces zero output until it finishes and is indistinguishable from a hang. Write raw output to a file and poll the file.
2. **Never run the backend suite and Karma concurrently.** It starves `MailerTest`'s `verify(sender, timeout(2000))` on an `@Async` send — it failed at exactly 2.021s, then passed alone. Pure self-inflicted flake.
3. **macOS has no `timeout` binary.** `timeout N cmd | tail` silently runs *nothing* and reports success from `tail`. `brew install coreutils` gives you `gtimeout`.
4. **The Docker build context is the REPO ROOT** (`context: ..` for both services), so everything in the working tree ships to the daemon on every `--build`, and anything a Dockerfile `COPY`s becomes a cache layer. `frontend/.angular/cache` (git-ignored, grows with every local `ng` run, reached 6.1 GB) once made `COPY frontend/ .` a **6.55 GB layer re-created on every build**, and the build cache reached 117.5 GB. Fixed on both sides: `.dockerignore` is an allow-list, and `docker/frontend.Dockerfile` copies named inputs instead of the whole directory. **If you add a Dockerfile `COPY`, re-include its path in `.dockerignore` explicitly**, or the build breaks.

### Retired

- *"Never kill a gate that looks stuck"* — the three stalls it was written for all traced to iCloud.
  The general caution stands for real gates, but killing a runaway `mv` on 2026-08-02 was correct and
  necessary; judgement, not a blanket rule.
- *"Fallback when you cannot wait the hour: `tsc --noEmit`"* — **deleted deliberately.** There is no
  hour to wait, so there is no reason to substitute a gate that is blind to template types and to
  unflushed `HttpTestingController` expectations. `tsc` is not a stand-in for the test suite.

## How to run / test
- **`cp docker/.env.example docker/.env` first, once.** Since M12c the stack takes its environment from `docker/.env` (gitignored) via `env_file`; compose treats a missing `env_file` path as a hard error and refuses to render anything, which is the point — a deploy that forgot a secret must fail loudly rather than run on a committed dev key. CI does the same `cp` before `up`.
- Full stack: `docker compose -f docker/docker-compose.yml up -d --build` → http://localhost. Dev users: `admin@demo.io` / `coach@demo.io` / `athlete@demo.io` / `super@demo.io` (superadmin, no box), password `boxhub-demo-2026`. Fresh volume seeds Demo Box + a weekly schedule. **Mailpit** (dev/e2e mail) at http://localhost:8025.
- Backend: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Frontend: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`. E2E: stack up, then `cd e2e && npx playwright test`.
- **`docker compose -f docker/docker-compose.yml down -v` is MANDATORY before an e2e run after a seeder or demo-password change** — the seeder self-skips when the demo box already exists, so a stale Postgres volume silently keeps the old data (cost real debugging time when the M8 demo password changed). Also: `runner`/`tv` specs are not idempotent (fixed-name TV devices accumulate) — they need a fresh stack.
- Flyway only for schema (V1–V17 applied; **next is V18**). Never edit an applied migration.
- **Dependency scanning (M11 T12, revised twice):** **OSV-Scanner** gates the **backend** on every push/PR/weekly (`.github/workflows/dependency-scan.yml`), no credentials, seconds. It scans a **CycloneDX SBOM** generated by Maven, not `pom.xml` — osv-scanner's Maven resolver fails on any dependency whose version comes from the Boot parent BOM and then skips the whole Maven side *while still exiting 0*. A guard step therefore asserts the scan really covered Maven; do not delete it, it has already caught two silent no-ops. **The backend currently scans clean.** The gate is backend-only on purpose: osv-scanner has no severity threshold, and npm knowingly carries Angular 19's advisories until M12, so including npm would make the job permanently red. npm's policy is `npm audit --audit-level=critical --omit=dev` gating every push in `ci.yml` plus an informational high-severity listing. Non-blocking findings belong in `osv-scanner.toml` with a written reason. Dependabot does version updates monthly, grouped, capped, **majors excluded**.
- **Dependency posture (2026-07-27):** Spring Boot **3.5.16**; `postgresql` and `jackson-databind` pinned one patch ahead of what Boot manages, each with its advisory id in `backend/pom.xml` and a note to drop the pin once Boot catches up. Getting here mattered: the pinned 3.4.1 was carrying ~25 Tomcat CVEs (several 9.8, in the server handling every request), three 9.0s in Thymeleaf, an Actuator auth bypass (8.2 x2, and `/actuator/health` is exposed through nginx) and a 9.1 in `spring-security-web`. The 3.4->3.5 bump moves Spring Security 6.4->6.5, where M11's cookie/CSRF work is coupled — verified by 390 backend tests plus the full e2e suite on a stack rebuilt from scratch, not by the unit suite alone.
- **Secrets dev note (M10, revised by M11 T6):** `BOXHUB_JWT_SECRET`, `BOXHUB_STRIPE_ENC_KEYS` and `BOXHUB_MEDIA_LINK_SECRET` are ALL required for the backend to boot — docker-compose supplies dev values; there is deliberately NO fallback in `application.yml` for any of them, so a deploy without one fails fast rather than running on a committed key. `SecretDefaultsTest` fails the build if a secret-shaped property ever regains a usable default. **`BOXHUB_STRIPE_ENC_KEYS` (renamed from `BOXHUB_STRIPE_ENC_KEY`) is now a comma-separated `version:base64key` list, newest first** — e.g. `2:<new>,1:<old>`; `encrypt` uses the highest version and prefixes ciphertext `v{n}:`, `decrypt` picks the key by prefix, and unprefixed (pre-M11) rows decrypt under v1, so migrating is just `BOXHUB_STRIPE_ENC_KEYS=1:$OLD_BOXHUB_STRIPE_ENC_KEY` with no re-encryption. A box needs a REAL Stripe restricted key + webhook secret to exercise the online rail; the demo stack runs entirely on admin-recorded payments.

## RULES — maintain these (from CLAUDE.md + user feedback)
- **Milestone lock:** work only the active milestone; out-of-scope ideas → `docs/BACKLOG.md`, don't build them.
- **Superpowers flow per milestone:** brainstorming (design spec + user approval gate) → writing-plans → execute → finishing-a-development-branch. Design/creative work starts with brainstorming.
- **Process pace = JUDGMENT, lean (user insisted 3×):** DEFAULT to INLINE execution by the main thread (write files, run tests+build, commit). Do NOT spin up implementer+reviewer subagents per task for mechanical/well-specified work — that was too slow/expensive in M0/M1. Spawn ONE agent (implementer, optionally one review) ONLY for genuinely parallel, high-uncertainty, or high-risk work (security, tenancy, concurrency e.g. the booking engine, money). Tests + build + targeted greps are the gate. Commit in batches. Track in `.superpowers/sdd/progress.md`.
- **Design (binding, design law v3 since M13b):** tokens only — a raw hex outside `_tokens.scss` is a bug. **Dark only**, no light theme; volt (`--volt`) is the only accent (live/now/primary/winning, bounded by area — never a card/panel/page background); `--danger` may fill a button or chip only; no glow/gradients/shadows-on-flat-surfaces; focus ring is a solid outline, inverting on volt surfaces; mono (JetBrains Mono) is the prescription voice and is banned from prose; numbers tabular; identity lives in HERO screens (WOD board, leaderboard, PR page, live runner, TV), plumbing stays conventional; screens built from `bh-*` components. Fonts self-hosted via @fontsource (Archivo + JetBrains Mono). Full detail: `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md`.
- **Tenancy (binding):** resolve tenant ONLY from `TenantContext`; every box endpoint gets cross-tenant-denied test; @TenantId tenant-agnostic queries = native SQL.
- **Commits:** conventional; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never commit `.DS_Store`. Commit/push only what the user's flow implies (they've been fine with push after merge).
- **Communication:** caveman + ponytail plugins are active (terse prose, laziest-correct code) — code/commits/security written normally.

## Immediate next step

**M13b is complete on branch `m13b-design-language`, not yet merged.** All twelve plan tasks are
done and every gate is green locally. **CI has not run on it — check the run before merging; a local
green is not the gate**, and M13a passed 28/28 locally then went red on CI.

**One known flake, filed in `docs/BACKLOG.md`:** the M13a merge commit's CI run failed once at
`runner.spec.ts:45` (`data-timer` expected `RUNNING`, got `none`) and **passed on re-run of the same
commit**. Non-deterministic, not an M13a regression, and the `/app` move is ruled out (the SSE URL is
absolute). M12a predicted this specific half failing and left the split assertion as the diagnostic.
It passed on every M13b run.

Backend **428** / frontend **182** / e2e **28** at `retries: 0`. **Next Flyway is V19** — M13a used
V18 and M13b added no migration.

**One thing on the branch is computed rather than verified:** the receipt page's new `@media print`
block (`receipt.page.ts`) was never printed to PDF and looked at. The CSS is scoped to `:host` and
the token overrides are straightforward, but the plan called for opening the PDF and nobody did.
Worth one manual print before merge.

**Before you run anything: `cp docker/.env.example docker/.env`.** The stack will not start without it.

**The app now lives at `/app`.** `http://localhost/` permanently redirects there; the API stays at
`/api`, and the OAuth chain at `/oauth2` + `/login/oauth2` — both at the server root, deliberately.

**Optional TLS:** `docker compose -f docker/docker-compose.yml --profile tls up -d --build`, after
generating a cert into `docker/dev-tls/` and adding a hosts entry. See `README.md`.

**NEXT: M13c — the component library.** ~22 `bh-*` components rebuilt against design law v3, the
dev gallery at `/app/dev/components` (**which now exists** — M13b created it early for the proof
screens, and M13c grows it into the full gallery), plus visual-regression and axe-core WCAG checks.

Read `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md` first. It is binding, and
§12.1 sets the i18n marker convention those ~22 components inherit.

**Still owed by the user, and it blocks M14's spec:** a tour of the coach programming screens —
Types, WOD library, Benchmarks, instance Builder. Coach was skipped in the 2026-08-02 product tour,
then split, and the half that landed in M14 has never been reviewed by anyone. **The brand-name
blocker is gone** — the product is `rxed`, settled 2026-08-06.

**Two decisions M13c inherits, both recorded rather than left to be rediscovered:**
- `bh-stat` has **zero call sites**. Decide whether to build it or delete it; do not restyle a
  component nothing renders.
- The 4 kB `anyComponentStyle` budget and the tokens-only rule pull against each other —
  `var(--fs-meta)` is eleven characters longer than `11px`, and M13b's members proof went over
  budget purely by replacing a raw value with its token. Note also that inline `style=""` in
  template markup does **not** count toward that budget at all.

**Read `docs/BACKLOG.md` top-down — it is organised by destination and tells you what to do next.**

Order of work, decided with the user: **reduce the backlog first, then the UX rework, then features.**

1. ~~**M12a — Test & CI reliability**~~ — DONE. e2e runs at `retries: 0`; a red build means something again.
2. ~~**M12b — Correctness & data integrity**~~ — DONE. Flyway V16 + V17.
3. ~~**M12c — Production readiness**~~ — DONE. Spec `docs/superpowers/specs/2026-07-28-m12c-production-readiness-design.md`,
   plan `docs/superpowers/plans/2026-07-28-m12c-production-readiness.md`. Remaining deploy work
   (TLS, backups, restore drill, real-Google SSO verification) is filed under **Launch → Production**
   in `docs/BACKLOG.md`, not in a milestone.
4. **M12 — UX/UI rework** ← **START HERE.** Task 1 is the **Angular 19 → 22** upgrade (19 is EOL). When it lands: flip the
   per-push npm gate to `--audit-level=high`, drop `continue-on-error` from the nightly step, and fold npm
   back into the OSV gate.
5. **M15 / M16 / M17** — programming depth, payments depth, platform & accounts. Deliberately *after* the
   rework: they ship screens, and building them first means building that UI twice.

TV items belong to **Project 2 (The Room)** and are not scheduled here.

**Specs + plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/`, one pair per milestone.
**Task→SHA ledger + every environment trap:** `.superpowers/sdd/progress.md` — git-ignored, so it is the only
place some of this survives. Read the M11/M12a/M12b sections before running anything.

## What execution has taught (carry forward)

**On gates — every one of these cost real time:**
- **Check the CI run after every push. A local green is not the gate.** Three M11 failures appeared only on
  Linux CI, and one had been failing silently since M10's push, unnoticed for six days while this document
  claimed "CI green on push".
- **A test that has never been seen to fail proves nothing.** M11's conformance sweep looked complete and was
  hollow — it probed with a random UUID, so a deliberately broken handler *passed* it. My own OSV scanner
  config later went green while scanning zero packages. Budget for the negative control, always.
- **Know what each gate is blind to** (see GATE GAPS above): `tsc --noEmit` sees neither Angular template
  types nor unflushed HTTP expectations; a green backend suite does not see cross-feature regressions.
- **e2e keeps earning its keep.** It has caught a real product bug in M10, M11, M12a and M12b — most recently
  a fix that broke the very flow it was meant to help, which 405 green backend tests did not see.

**On process:**
- **ALWAYS subagent** (binding, in `CLAUDE.md`). The orchestrator dispatches, reviews every diff, runs the
  gates, commits and merges — and implements only genuinely difficult/delicate work or trivial glue.
- **Executors stopping is the system working.** Roughly half the task briefs written this session contained a
  factual error — an unverified specific asserted from a grep instead of reading the code. Every one was
  caught because briefs tell executors to stop rather than improvise. Do not assert exact strings, signatures
  or schema in a brief without opening the file.
- **Attempting the work is how stale backlog items get found.** Five items this session turned out to be
  already fixed or describing code that no longer exists.
- **A stop-rule should name what it forbids**, not use a blanket verb. "Do not tune" once made an executor
  retire a test whose fix was one line.
- **Escalate rather than loosen.** Executors stopped instead of widening a CSP, lowering an audit threshold,
  or bending production code to match a wrong brief. All three were right.

**On this codebase specifically:**
- **Tenancy:** the `@TenantId` failure mode is a *wrong ambient tenant*, not an absent one — a genuinely
  tenant-less read fails **open**. `docs/TENANCY.md` is the authority; two entries in the ledger once said
  otherwise.
- **`AuthzConformanceTest` is a standing guarantee.** A new route fails it until someone declares intent.
  Note that adding `@Valid` to a request body makes validation run *before* imperative `RoleGuard`, which
  turns a 403 into a 400 and breaks the sweep's foreign-box probe — M12b hit exactly this.
- **Mail fires strictly after commit; an audit row is written strictly inside the transaction.**
- **nginx `add_header` replaces, it does not merge** — headers set at `server` level vanish from any location
  that sets its own.
