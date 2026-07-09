# BoxHub — Session Hand-off

**Updated:** 2026-07-09. Read this first, then the authoritative docs it points to. Everything here is current as of `main`.

## What BoxHub is
Multi-tenant CrossFit box platform: athletes book classes & track WODs, coaches program & run classes, box admins manage members/schedule, plus a TV whiteboard. Angular 19 + Spring Boot 3.4 / Java 21 + Postgres 16, Docker Compose behind nginx, one VPS target. Repo: `~/Desktop/boxhub`, GitHub `alelomo1998/boxhub` (private), CI green on push.

## Authoritative docs (read in this order)
1. **`CLAUDE.md`** (repo root) — binding rules, loaded every session. Workflow + design + tenancy rules.
2. **Master spec / roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` — milestones M0–M7, operating rules.
3. **Design law:** `docs/superpowers/specs/2026-07-08-design-system-design.md` — binding for ALL frontend.
4. **Milestone specs+plans:** `docs/superpowers/specs/` and `docs/superpowers/plans/` (one spec + one plan per milestone).
5. **Backlog:** `docs/BACKLOG.md`. **Progress ledger:** `.superpowers/sdd/progress.md` (git-ignored; the recovery map — commit SHAs per task).
6. **User memory:** `~/.claude/projects/-Users-alessandrolomonaco-Desktop/memory/` (MEMORY.md index + boxhub-project.md, boxhub-process-pace.md).

## Status — done and on `main`
- **M0 foundations** — auth (JWT access+refresh rotation), per-box role memberships, box-scoped tenant tokens, `TenantContext`, RFC7807 errors, Flyway V1, Angular shells + auth, Docker Compose, CI, deploy script.
- **M1 box core** — plans CRUD, invites (one-time hashed shareable link, no SMTP), public preview + accept, superadmin + box creation, member list/search/patch (last-admin guard), box settings, per-IP auth rate limiting, Hibernate `@TenantId`. Flyway V2.
- **Design system** — warm-dark "broadcast/heritage" identity. Token file is single source of truth; `bh-*` shared components; ThemeService (dark default). ALL existing screens restyled.
- **M2 scheduling & booking** — Flyway V3; class templates → auto-generated sessions (rolling horizon, `@Scheduled`); **BookingService** engine (session-row pessimistic lock, FIFO waitlist auto-promote, cancel cutoff, plan weekly-limit — no-oversell proven by concurrency test); coach roster + check-in; nightly no-show sweep; athlete booking UI + coach sessions/roster + admin schedule; richer booking view (coach name + booked athletes); dev seeder now seeds a real weekly schedule.

**Tests:** backend ~77 (Testcontainers Postgres), frontend 24 Karma specs, e2e 7 Playwright (SERIAL — `workers:1`). All green on `main`. No open branches. Working tree clean except a stashed doc-title edit (ignore).

## What's NOT done (next)
- **M3 programming** — movements catalog, WOD builder (typed JSONB blocks), programming calendar, tracks (RX/Fitness). Tracks were deliberately deferred from M2.
- **M4 tracking** — score/PR logging, history, per-movement progression, leaderboards. (Athlete WOD/PR screens are still "coming soon" placeholders wired to the design system.)
- **M5 TV display** — `/tv` pairing + live WOD/timer/leaderboard (its own high-contrast surface on the same tokens). TV shell is a placeholder.
- **M6 coach class runner** — live in-class runner (M2 built the static roster as its seed).
- **M7 hardening & pilot.**
- **BACKLOG.md** items: box-token refresh already done; open items incl. no server-side logout/revocation, no purge job for expired refresh_tokens/invites, rate-limit is per-node in-memory, member-list N+1, e2e cold-start flake (mitigated by workers:1), and the **@TenantId native-query audit** (see gotchas). VPS never deployed. `TODO` in spec §6: member export + hard delete.

## Architecture
- **Backend:** modular monolith, package = module boundary under `com.boxhub`: `identity` (users/auth/memberships), `box` (boxes/plans/invites/templates/sessions/bookings), `shared` (tenancy/errors/RoleGuard/rate-limit/seeder). `programming`, `performance`, `display` packages will come with M3–M5.
- **Multi-tenancy:** single DB, `box_id` on every tenant table, Hibernate 6 `@TenantId` discriminator resolved from the JWT `box_id` claim via `shared/TenantIdentifierResolver` + `TenantContext`. Null tenant = fail-OPEN "root" (documented in ADR-001 amendment) — safe only because `/api/box/**` requires `SCOPE_box`. Every box endpoint has happy + auth-denied + cross-tenant-denied tests (mandatory).
- **Auth:** stateless JWT (HS256), user token → box token (after ACTIVE-membership check) → box-scoped requests. Superadmin via config allowlist claim.
- **Frontend:** Angular standalone + signals. `src/styles/_tokens.scss` = ONLY place raw color/type/spacing live. `src/app/ui/` = `bh-*` components (button, field, pill, tag, stat, board-row, panel, rail/nav; `.bh-table` styles). Screens in `src/app/features/{auth,admin,athlete,coach,tv,join,booking}`. `core/auth` (AuthService+interceptor+guards), `core/theme`.
- **Booking engine** (`box/BookingService`): every state transition `@Transactional` under `ClassSessionRepository.findWithLockById` (SELECT … FOR UPDATE). Cancel = DELETE the booking row (not a CANCELLED status); CHECKED_IN/NO_SHOW persist. Reason codes returned as `ResponseStatusException(409, "CODE")` → problem+json `detail`.

## CRITICAL gotchas (these bit us repeatedly)
1. **@TenantId silently filters JPQL/derived queries AND bulk updates.** Any query that must be tenant-agnostic (lookup by unguessable token, cross-box job) MUST be NATIVE SQL. Bit us on invite `findByTokenHash` + `burnIfUnaccepted`. **Audit before adding tenant-agnostic access to a @TenantId entity.**
2. **System-level writers of @TenantId entities have no tenant** (schedulers, seeder). Set a synthetic box tenant (JwtAuthenticationToken with `box_id` claim, `SCOPE_box`) **BEFORE the transaction opens** — open the tx via `TransactionTemplate` INSIDE the tenant scope, else `@TenantId` resolves to the all-zeros sentinel → FK violation. See `box/SessionGenerator.runAsBox` and `shared/DevDataSeeder`.
3. **`@Transactional` on a test method** binds the Hibernate session before auth is set → sentinel tenant. Don't; wrap only the locking call in a `TransactionTemplate` after `actAsBox`.
4. **Lazy `User` on `Membership`** (OSIV off): endpoints resolving athlete/coach names need `@Transactional(readOnly=true)` to keep the session open.
5. **Build env:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` for all backend mvn (system JDK is 26, too new for Boot 3.4). Testcontainers pinned `1.21.4` (older pins Docker API v1.32, rejected by local Docker 29). Node 26 warns for Angular 19 — ignore.
6. **e2e is serial** (`e2e/playwright.config.ts` workers:1) + retries:1 — it shares one seeded backend; parallel caused flake. Cold-start still needs the retry.

## How to run / test
- Full stack: `docker compose -f docker/docker-compose.yml up -d --build` → http://localhost. Dev users: `admin@demo.io` / `coach@demo.io` / `athlete@demo.io`, password `password123`. Fresh volume seeds Demo Box + a weekly schedule.
- Backend: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Frontend: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`. E2E: stack up, then `cd e2e && npx playwright test`.
- Flyway only for schema (V1/V2/V3 applied; next is V4). Never edit an applied migration.

## RULES — maintain these (from CLAUDE.md + user feedback)
- **Milestone lock:** work only the active milestone; out-of-scope ideas → `docs/BACKLOG.md`, don't build them.
- **Superpowers flow per milestone:** brainstorming (design spec + user approval gate) → writing-plans → execute → finishing-a-development-branch. Design/creative work starts with brainstorming.
- **Process pace = JUDGMENT, lean (user insisted 3×):** DEFAULT to INLINE execution by the main thread (write files, run tests+build, commit). Do NOT spin up implementer+reviewer subagents per task for mechanical/well-specified work — that was too slow/expensive in M0/M1. Spawn ONE agent (implementer, optionally one review) ONLY for genuinely parallel, high-uncertainty, or high-risk work (security, tenancy, concurrency e.g. the booking engine, money). Tests + build + targeted greps are the gate. Commit in batches. Track in `.superpowers/sdd/progress.md`.
- **Design (binding):** tokens only — a raw hex outside `_tokens.scss` is a bug. Warm dark is home theme; race red (`--red`) is the only accent (live/primary/winning); glow rationed (primary hover, live dot, focus ring); no gradients/fake-textures; numbers tabular; identity lives in HERO screens (WOD board, leaderboard, PR page, live runner, TV), plumbing stays conventional; screens built from `bh-*` components. Fonts self-hosted via @fontsource (Saira Condensed display + Archivo body).
- **Tenancy (binding):** resolve tenant ONLY from `TenantContext`; every box endpoint gets cross-tenant-denied test; @TenantId tenant-agnostic queries = native SQL.
- **Commits:** conventional; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never commit `.DS_Store`. Commit/push only what the user's flow implies (they've been fine with push after merge).
- **Communication:** caveman + ponytail plugins are active (terse prose, laziest-correct code) — code/commits/security written normally.

## Immediate next step
Pick M3 (programming) or M4 (tracking) with the user, then run the superpowers flow: brainstorm the milestone's specific decisions → write spec (get approval) → write plan → execute lean. The design system + booking foundations are ready to build on. A compose stack may still be running locally (`docker compose ... down` to stop).
