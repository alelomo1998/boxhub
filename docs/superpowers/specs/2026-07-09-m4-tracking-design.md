# M4 — Tracking (athlete) — design spec

**Date:** 2026-07-09. **Milestone:** M4. **Status:** approved, ready for plan.
**Depends on:** M0 (auth/tenancy), M1 (memberships), M2 (rosters), M3 (programming: slots/WODs/movements/benchmarks).
**Roadmap:** `docs/superpowers/specs/2026-07-07-boxhub-design.md` §M4.

## Goal & acceptance

Athletes log WOD scores against published programming, log named-lift maxes, and see their
history, PRs, per-movement progression, benchmark history, and a per-session leaderboard.

**Acceptance (from roadmap):**
- Athlete logs a Fran time on phone in < 30s.
- A new PR is auto-detected (heavier lift than before flags a PR).
- Leaderboard orders correctly by score type, RX above scaled, respects the privacy flag.

## Key decisions (locked in brainstorm)

1. **A WOD score attaches to a `program_slot`** (date+track+WOD), not a bare WOD. Gives a
   natural per-session leaderboard, clean RX/scaled split, and benchmark history via
   `slot → wod.benchmark_template_id`. Athletes log only against **published** slots.
2. **Separate lift log + derived benchmark PRs.** A dedicated `lift_entry` table holds named
   maxes (movement, load, reps, date); logging a heavier entry auto-flags a PR. Benchmark PRs
   are DERIVED by querying `wod_score` rows whose slot's WOD has a `benchmark_template_id` — no
   extra storage.
3. **Per-score `private` flag** (default off). A private score still counts for the athlete's
   own history/PRs but is omitted from the session leaderboard.
4. **Athlete self-log only.** M4 ships athlete self-logging + all viewing. Coach bulk
   score-entry grid is M6 (class runner). No coach/roster write surface in M4.
5. **Score value = explicit typed columns**, not one generic value: `time_seconds`, `rounds`,
   `reps`, `load`, `finished`. Read by the slot WOD's `score_type`.
6. **Progression chart = inline SVG** (no charting library — CSP blocks CDNs; tokens only).

## Architecture

Backend package `com.boxhub.performance` (scores, lifts, leaderboard, history). Frontend:
extend the athlete WOD board with score logging + leaderboard peek; new athlete "My progress"
page (history/PRs/chart) replacing the PR placeholder; a lift-log entry surface. Flyway **V6**.

### Schema (Flyway V6)

Both tables are `@TenantId` box-scoped.

| Table | Columns (essential) |
|---|---|
| `wod_score` | id, box_id, slot_id (FK program_slot), membership_id (FK memberships), rx bool not null default true, time_seconds int, rounds int, reps int, load numeric(7,2), finished bool not null default true, notes text, private bool not null default false, created_at, updated_at. **UNIQUE (box_id, slot_id, membership_id)**. |
| `lift_entry` | id, box_id, membership_id (FK memberships), movement_id (FK movement), load numeric(7,2) not null, reps int not null default 1, performed_on date not null, notes text, is_pr bool not null default false, created_at. |

FKs: slot_id → program_slot (RESTRICT), membership_id → memberships (CASCADE on member
delete), movement_id → movement (RESTRICT). Index `wod_score(box_id, slot_id)` for
leaderboards, `lift_entry(box_id, membership_id, movement_id, performed_on)` for progression.

`load` is `numeric(7,2)` (kg or lb — box's unit is display-only in M4; unit setting → BACKLOG).

### Value semantics by `score_type`

- **TIME** — `time_seconds`; if `finished=false` (hit the cap), rank by `reps` completed.
- **ROUNDS_REPS** — `rounds` + `reps` (AMRAP).
- **LOAD** — `load` (e.g. a 1RM-in-the-WOD or max-load piece).
- **NONE** — completion only (row exists = done); no ranking.

The API validates that the fields relevant to the slot's `score_type` are present; irrelevant
fields are ignored/nulled.

## Tenancy (binding — CLAUDE.md)

- `wod_score`, `lift_entry` are `@TenantId` — standard box scoping.
- **Self-log only:** `membership_id` is resolved from the caller's JWT membership, NEVER a
  request param. The write path looks up the caller's membership in the active box and uses its
  id. An athlete cannot write another athlete's score.
- **Every endpoint** gets happy + auth-denied + cross-tenant-denied tests. Plus explicit:
  athlete A cannot create/read/edit athlete B's score; scores on a slot from another box are
  invisible.
- Score PUT validates the slot is `PUBLISHED` and belongs to the box (foreign/draft slot → 404).

## Backend API (`/api/box/**`)

Reads by any box member; writes are self-scoped.

- **WOD score** —
  - `PUT /program/{slotId}/score` — upsert the caller's own score for a published slot. Body:
    `{rx, timeSeconds?, rounds?, reps?, load?, finished?, notes?, private?}`. 404 if slot
    foreign/draft/absent. Returns `ScoreDto`.
  - `GET /program/{slotId}/score` — the caller's own score (or 204/empty if none).
  - `GET /program/{slotId}/leaderboard` — `LeaderboardDto`: ordered entries, RX block before
    scaled, ranked per the slot WOD's `score_type` (TIME: finished asc by time, then unfinished
    desc by reps; ROUNDS_REPS: desc rounds then reps; LOAD: desc load; NONE: unordered
    completion list). Private scores omitted. Each entry: athlete name, rx, formatted value.
- **Lift log** —
  - `POST /lifts` — `{movementId, load, reps?, performedOn?, notes?}` → 201 `LiftDto` with
    `isPr` set (true iff `load` > prior best load for this caller+movement).
  - `GET /lifts?movementId=` — the caller's entries (date asc) for a movement (progression).
  - `GET /lifts/prs` — best entry per movement for the caller (PR list).
- **History** —
  - `GET /my-scores` — the caller's WOD scores (recent first), with slot/WOD/track context.
  - `GET /benchmark-history` — best score per benchmark for the caller, DERIVED from
    `wod_score` joined to slots whose WOD has a `benchmark_template_id` (best per benchmark name,
    with date). Native/explicit join — no new storage.

DTOs: `ScoreDto(id, slotId, rx, timeSeconds, rounds, reps, load, finished, notes, private,
scoreType)`; `LeaderboardDto(scoreType, entries[])`, `LeaderboardEntry(rank, athleteName, rx,
timeSeconds, rounds, reps, load, finished)`; `LiftDto(id, movementId, movementName, load, reps,
performedOn, isPr)`; `BenchmarkHistoryEntry(benchmarkName, timeSeconds/score, performedOn)`.

Errors: RFC7807 (existing). Validation 400; foreign/draft slot 404; role/self violations 403/404.

## Frontend

Design law binding: tokens only, `bh-*` components, warm-dark, race-red only for
live/primary/winning (leaderboard #1 / PR badge may use it — winning is a sanctioned use),
numbers tabular, identity in hero screens.

- **Athlete WOD board** (extend M3 hero) — per published track: a **"Log score"** action opens
  a score form matched to `score_type` (time m:ss input / rounds+reps / load), RX–scaled
  toggle, `finished` toggle for TIME, notes, private toggle. Shows the caller's logged score
  inline once saved, and a **"Leaderboard"** peek (top few, RX/scaled split). < 30s to log.
- **My progress** (`features/athlete/progress.page`) — replaces the PR "coming soon":
  benchmark history (best per benchmark, PR badge), lift PR table, and a **per-movement
  progression chart** (inline SVG line, movement selector). Tabular numbers.
- **Lift log** — quick entry (movement picker via M3 `movements()`, load, reps, date), auto-PR
  badge on save; recent entries list.
- **Leaderboard** — per-slot view (from the board peek or a dedicated route): RX above scaled,
  tabular, #1 gets the rationed accent, private rows absent. On-load only (live push is M5/TV).

## Seeding

`DevDataSeeder`: for the demo box's published week, seed a handful of `wod_score` rows across
the demo athlete + a couple of extra seeded athletes (so leaderboards aren't singletons), and a
few `lift_entry` rows for the demo athlete (so PR/progression render). Mix RX/scaled + one
private score to exercise the split.

## Testing

- **Backend** (Testcontainers): per-endpoint happy + auth-denied + cross-tenant-denied;
  self-log-only (A cannot write/read B's score, membership from JWT); score upsert (re-PUT
  edits, no duplicate row); PUT against draft/foreign slot → 404; leaderboard ordering for each
  score_type + RX-above-scaled + private-omitted; auto-PR (heavier flags is_pr true, equal/
  lighter false); benchmark-history derivation (best per benchmark, only benchmark-linked WODs).
- **Frontend** (Karma): performance service spec; score-form + progress-page + chart component
  specs (per project convention — services/ui get specs; keep feature-page specs light).
- **e2e** (Playwright, serial): athlete logs a Fran-style time on a published slot → sees it on
  the leaderboard; logs a heavier lift than seed → PR badge shows.

## Scope cuts → BACKLOG

Realtime/live leaderboard push (M5 TV) · coach bulk score-entry grid (M6) · rep-adjusted 1RM
estimation for PRs · load unit (kg/lb) per-box setting + conversion · score photos/videos ·
cross-box/global benchmark leaderboards · comments/reactions on scores · advanced charting
(zoom, multi-movement overlay, PR trend lines).

## Out of scope (later milestones)

TV display + live leaderboard (M5). Coach class runner + bulk score grid (M6). Hardening (M7).
