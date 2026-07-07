# BoxHub — Design Spec & Master Prompt

**Date:** 2026-07-07 · **Status:** approved design, pre-implementation
**One-liner:** Unified CrossFit box platform — athlete tracking, coach programming + live class running, box administration, and a realtime TV whiteboard — in one app instead of the 3–5 tools boxes stitch together today.

This document is the master prompt for all development sessions. Every session starts by reading this doc and the current milestone. **No work outside the current milestone.**

---

## 1. Why this exists (market gaps, researched 2026-07)

| Gap in existing tools | Evidence | BoxHub answer |
|---|---|---|
| Reliability | Wodify: freezes, "servers down", 2s tab loads — top complaint on Capterra/G2/Trustpilot | Boring, monitored monolith; performance budgets in DoD |
| Fragmentation | Boxes run SugarWOD (community) + BTWB (analytics) + booking tool + TV browser hack | One app, one login, one data model |
| Weak TV integration | Timers not integrated with WOD/leaderboard screens; casting hacks | First-class `/tv` route, paired devices, server-synced timers |
| No coach in-class flow | Clunky score entry, no team/heat builder, no programming delivery | "Class runner" screen: roster → heats → timer → tap score entry → TV |
| Analytics split from management | SugarWOD has none; BTWB has no gym ops | Movement-level PR progression on the athlete's own data |

## 2. Users & roles

- **ATHLETE** — profile, book classes, log scores/PRs, history, benchmarks, leaderboards.
- **COACH** — create WODs, programming calendar, run live classes (teams/heats, timer, score entry), control TVs.
- **BOX_ADMIN** — members, membership plans/expiry, class schedule, coaches, TVs. (Often also a coach.)
- **SUPERADMIN** — platform-level tenant management (us).

A user holds roles **per box** via `membership(user_id, box_id, role, plan, expires_at)` — coach in one box, athlete in another.

## 3. Scope

**Phase 1 (this spec):** multi-tenant core, scheduling + booking, programming, score/PR tracking, TV display, coach class runner. Responsive web for all roles (athletes use phone browser).

**Non-goals phase 1 (do not build, do not scaffold):**
- Payments/billing — plans and expiry are tracked, money moves outside the app
- Native mobile apps — phase 2 (PWA push notifications first, then native if needed)
- Deep analytics/ML, nutrition, competition/Open mode, social feed beyond class comments
- Redis / multi-node scaling — single VPS, in-process cache

## 4. Architecture

**Stack:** Angular 19 (standalone components, signals) · Spring Boot 3.x / Java 21 · Postgres 16 · Flyway · Caffeine cache · WebSocket (STOMP) · Docker Compose · nginx · single VPS (Hetzner/DO class).

**Shape:** modular monolith. One Spring Boot app, packages as module boundaries — no cross-module entity references, communicate via service interfaces:

```
com.boxhub
├── identity      # users, auth (JWT access+refresh), memberships, roles
├── box           # boxes, plans, class templates/sessions, booking, attendance
├── programming   # movements, WODs, programming calendar, tracks
├── performance   # scores, PRs, benchmarks, leaderboards
├── display       # tv devices, pairing, screen state, live push
└── shared        # tenancy, errors, events
```

One Angular app, lazy route areas: `/athlete` · `/coach` · `/admin` · `/tv` (zero-chrome fullscreen) · `/auth`.

**Multi-tenancy:** single database, `box_id` discriminator column on every tenant-owned table, enforced with Hibernate 6 `@TenantId`. JWT carries `user_id`, `active_box_id`, `role`. Every request resolves tenant from token — never from client-supplied params. Cross-tenant access = test-covered impossibility.

**Caching:** Caffeine on hot reads — today's WOD per box, leaderboard per session (invalidated on score write), movement catalog. ETags on GET. Add Redis only when a second node exists.

**Realtime / TV:**
- TV opens `/tv` → gets 6-digit pairing code → coach/admin claims it → device stored with box + name ("Rig wall left").
- Server pushes screen state over STOMP topics: `/topic/box/{boxId}/tv/{deviceId}`.
- Views: today's WOD · timer · live leaderboard · teams/heats · PR celebration.
- **Timers are server-authoritative:** server broadcasts `{spec, start_at_epoch}`; clients render locally from their clock — no tick streaming, no drift, reconnect-safe. Timer types: For Time (count up + cap), AMRAP (count down), EMOM (interval), Tabata (work/rest).
- TV client auto-reconnects with backoff and re-fetches state on reconnect; offline shows last state + "reconnecting" badge (box Wi-Fi is hostile).

**WOD model:** typed structure stored as JSONB, discriminated by `type` (FOR_TIME, AMRAP, EMOM, TABATA, STRENGTH, CUSTOM). Each block references movements from the catalog with rep scheme / load / scaling notes. Score type derives from WOD type (time, rounds+reps, load, custom). Benchmarks (Fran, Cindy, girls/heroes) are seeded global WODs; a box programs a benchmark to get comparable history.

## 5. Data model (core tables)

```
user(id, email, password_hash, name, ...)
box(id, name, slug, timezone, ...)
membership(id, user_id, box_id, role, plan_id, expires_at, status)
plan(id, box_id, name, weekly_class_limit, duration)            -- no money fields
class_template(id, box_id, weekday, time, capacity, coach_id, track_id, name)
class_session(id, box_id, date, time, capacity, coach_id, track_id, status)
booking(id, session_id, membership_id, status: BOOKED|WAITLIST|CHECKED_IN|NO_SHOW, checked_in_at)
movement(id, name, category, video_url, global|box-owned)
wod(id, box_id nullable for global benchmarks, title, type, structure jsonb, score_type, benchmark bool)
track(id, box_id, name)                                          -- e.g. RX / Fitness / Competitor
programming_entry(id, box_id, wod_id, date, track_id, published bool, coach_notes)
score(id, programming_entry_id, membership_id, value jsonb, rx bool, scaled_notes, logged_by)
pr(id, membership_id, movement_id, value, unit, date, source: score|manual)
tv_device(id, box_id, name, pairing_code, current_view jsonb, last_seen_at)
class_team(id, session_id, name, lane) / class_team_member(team_id, membership_id)
```

Rules: FKs + constraints in DB, not just app code. All tenant tables carry `box_id`. UTC timestamps, box timezone for display.

## 6. Security & validation

- Spring Security, stateless JWT (short-lived access + rotating refresh), bcrypt.
- Method-level authorization by role AND tenant on every endpoint; TV endpoints authenticated by device token issued at pairing.
- Bean Validation on every request DTO; JSONB structures validated against typed schema before persist.
- Rate limit auth endpoints. No PII beyond name/email. GDPR-minded: member export + hard delete.

## 7. Testing & quality bar

- **Per milestone:** unit tests on domain logic, `@SpringBootTest` slice tests on each new endpoint (happy + auth-denied + cross-tenant-denied), one Playwright e2e per user-facing flow of the milestone.
- Cross-tenant denial tests are mandatory for every new resource — non-negotiable.
- Testcontainers for Postgres in CI. Flyway migrations must apply cleanly to an empty DB and to the previous milestone's DB.
- Performance budget: p95 < 300ms API reads on VPS-class hardware; TV screen update visible < 1s after score entry.

## 8. Operating system (anti-random rules)

1. **Milestone lock** — work only on the active milestone. Ideas out of scope go to `docs/BACKLOG.md`, one line each.
2. **Vertical slices** — every milestone ends usable end-to-end and deployed. No horizontal "all entities first" work.
3. **Definition of Done per milestone:** acceptance criteria demoed · tests green in CI · migrations clean · deployed to VPS · demo script executed.
4. **Schema changes only via Flyway.** Never edit an applied migration.
5. **ADRs** — irreversible/architectural decisions get a 10-line record in `docs/adr/`.
6. **Conventional commits**, small PRs/branches per feature even solo.
7. Each dev session: read this spec → read active milestone → state the slice being built → build → verify DoD items touched.

## 9. Milestones

### M0 — Foundations
Monorepo (`backend/`, `frontend/`, `docker/`), CI (build+test), Docker Compose (Postgres, backend, frontend, nginx), Spring skeleton with Flyway + JWT auth + tenancy filter + error contract, Angular skeleton with auth flow + 4 empty role shells + route guards, deploy script to VPS.
**Accept:** register/login works on deployed VPS; user with membership sees correct shell; cross-tenant test suite green; CI green.

### M1 — Box core (admin)
Box creation (superadmin), member invite/join flow, membership roles, plans + expiry (no payments), admin members table (search, status, expiry alerts), box settings (name, timezone, logo).
**Accept:** admin invites member by email → member registers → appears in list with plan; expiring memberships flagged.

### M2 — Scheduling & booking
Class templates → generated sessions, admin/coach calendar, athlete booking + waitlist (auto-promote), cancel rules (cutoff hours), check-in (coach marks or athlete self via code), attendance history, plan weekly-limit enforcement.
**Accept:** athlete books on phone, waitlist promotes on cancel, coach sees roster with check-ins, limits enforced.

### M3 — Programming (coach)
Movement catalog (seeded ~150 movements + box-custom), WOD builder (typed blocks per WOD type, movement picker, rep schemes, scaling notes), programming calendar (assign WOD → date+track, draft/publish), duplicate/reuse WODs, benchmark library seeded (girls + heroes).
**Accept:** coach builds Fran-style WOD in < 2 min, programs a full week on two tracks, publishes; athletes see published WODs only.

### M4 — Tracking (athlete)
Athlete home = today's WOD per track; score logging matched to score type (time/rounds/load), RX vs scaled, notes; auto-PR detection from strength scores + manual PR entry; history + per-movement PR progression (simple chart); benchmark history; session leaderboard (RX/scaled split, respectful of privacy flag).
**Accept:** athlete logs Fran time on phone in < 30s, PR detected, leaderboard orders correctly by score type.

### M5 — TV display
`/tv` route: pairing code flow, device management in admin; screens: today's WOD (auto-rotate tracks), server-synced timers (For Time/AMRAP/EMOM/Tabata with 10s countdown + beep), live leaderboard (updates < 1s after score entry), teams/heats view; WebSocket reconnect + last-state cache; readable from 10m (big type, high contrast, dark).
**Accept:** cheap stick browser paired in < 1 min; two TVs show identical timer; score entry appears on TV < 1s; Wi-Fi blip self-heals.

### M6 — Coach class runner
One coach screen per session: check-in roster → team/heat builder (drag or auto-split n teams) → timer control (start/pause/cap from WOD spec) → rapid score grid (tap athlete → enter → next, works offline-tolerant with retry queue) → push any view to any paired TV.
**Accept:** coach runs a 12-athlete class start-to-finish from one screen; all scores in before athletes leave; TV followed each phase.

### M7 — Hardening & pilot
Pilot with the real box: seed real data, coach + admin onboarding docs (1 page each), nightly `pg_dump` to offsite storage + restore drill, monitoring (uptime + error alerting, e.g. Uptime Kuma + Sentry), performance pass against budgets, bug-fix window, collect structured feedback → feeds phase 2 backlog.
**Accept:** two consecutive real weeks where box, coaches, athletes, TVs run on BoxHub without falling back to old tools.

### Phase 2 backlog (do not start)
PWA push notifications → native app if justified · payments (Stripe) · advanced analytics · competition/Open mode · social feed · multi-box federation · Redis + second node.

## 10. Research sources

- [Capterra — Wodify reviews](https://www.capterra.com/p/159663/Wodify/reviews/) · [G2 — Wodify](https://www.g2.com/products/wodify/reviews) · [Trustpilot — Wodify](https://www.trustpilot.com/review/www.wodify.com) · [JustUseApp — Wodify client](https://justuseapp.com/en/app/1563729830/wodify-client/reviews)
- [DroidLore — SugarWOD/BTWB/Wodify compared](https://droidlore.com/crossfit/crossfit-apps-boxmembers) · [Garage Gym Reviews — BTWB](https://www.garagegymreviews.com/beyond-the-whiteboard-review) · [SugarWOD vs BTWB](https://www.sugarwod.com/sugarwod-vs-btwb/)
- [FitViz — CrossFit gym software landscape 2026](https://www.fitvizpro.com/blog/crossfit-gym-software) · [Vibefam — what Reddit recommends 2026](https://vibefam.com/gym-management-software-reddit-2026/) · [BTWB WOD Screen](https://btwb.blog/2018/06/19/wodscreen-updates/)
