# M38 — scale readiness

**A brief, not a build**, in the same spirit as the analytics brief: it establishes what is true,
names the gaps, and sets budgets. Written 2026-08-27.

## Why this exists

The programme's verification effort is concentrated on the frontend — tokens, the `bh-*` library,
the dev-gallery contract, axe, visual baselines, and the impeccable routine. That is the category
where a defect is **cheap and reversible**: change a token, redeploy, done in hours.

The categories where a defect is **expensive and hard to reverse** — query performance under real
multi-tenant volume, and the ability to see what is happening in production — carry no gate at all.
This milestone closes that asymmetry. It is deliberately small.

## What is already true — measured, not assumed

Do not re-litigate these. They were checked on 2026-08-27 against the migrations and the build:

| Fact | Value |
|---|---|
| Tables | 44 |
| Indexes | **49** |
| Indexes covering `box_id` | **25**, several as composites |
| Foreign-key references | 87 |
| `@TenantId` entities | 64 |

**The tenancy indexing is in good shape** and several composites are well chosen —
`post (box_id, created_at desc)`, `class_sessions (box_id, start_at)`,
`schedule_slot (box_id, active)`, and a partial index on `bookings (box_id, cancelled_at)`. An
earlier claim in session that "no index on `box_id` exists" was **wrong**: it came from a
case-sensitive grep against lowercase DDL. Recorded here so nobody acts on the wrong version.

## The actual gaps

1. **No query-count or N+1 tests.** Nothing fails the build when a screen starts issuing a query
   per row. The hot paths are the ones a whole gym hits within the same sixty seconds: the class
   list, the roster, the leaderboard, and booking. An index does not save you from N+1 — the query
   is fast and there are four hundred of them.
2. **No load test.** `M28` already owns "rate limits under a class-opening rush", which is the
   right *scenario* — but it is scoped there as a rate-limit config task, not as a measurement.
   Nothing establishes what the system actually does at that moment, so nothing can regress.
3. **No application observability.** `spring-boot-starter-actuator` is present; there is no
   Prometheus, Grafana, OpenTelemetry, Sentry or equivalent, and no slow-query logging. `M28` lists
   "error monitoring and uptime" as deploy tasks. That covers *whether it is up*, not *why it is
   slow*, and slow is what a gym reports first.
4. **No performance budget.** No endpoint has a stated p95 target, so "fast enough" is a matter of
   opinion and cannot be tested.

## Scope

- **Query-count tests on the hot paths.** Assert a *bounded* number of statements per request
  (Hibernate statistics or an equivalent), not a timing — timings are flaky, statement counts are
  deterministic. These belong in the existing backend suite so they gate the build.
- **One load scenario, not a suite:** the class-opening rush — N members booking the same session
  as it opens. It is the worst realistic contention point and it is also where the booking engine's
  correctness matters most, so the test earns its keep twice.
- **Slow-query logging on**, plus one dashboard or equivalent that answers "which endpoint got
  slower this week".
- **A p95 budget per hot endpoint**, written down, and a means to check it.
- **Seed data at realistic volume.** The dev seeder builds one gym of ~10 athletes. Nothing in the
  repo has ever been observed against a gym of 300, let alone 200 gyms.

## Out of scope

Rewriting queries that have not been measured. Caching. Read replicas. Anything horizontal. This
milestone's job is to make performance **visible and gated**, not to optimise on a hunch.

## Placement

**Before `M28`.** M28 deploys; this decides what "healthy" means so M28 has something to deploy
against. It needs Phase A's screens to exist first, because the hot paths are defined by what the
screens actually query.
