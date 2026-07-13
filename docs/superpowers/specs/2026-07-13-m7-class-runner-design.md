# M7 — Coach Live Class Runner (design)

**Date:** 2026-07-13 · **Status:** approved design, pre-implementation
**One-liner:** One coach screen per session — roster + server-authoritative timer + rapid score grid — that runs a class start to finish and drives the timer onto every paired TV.

Scope split agreed 2026-07-13: **M7 = runner core** (this spec). **M7.5 = TV command** (manual per-device view selection, the `tv_devices.view` seam). **Heats/teams → backlog.** Master spec §143 defines the full runner; M7 delivers its accept criterion via auto-driven TVs (timer appears on TVs while running, same auto model M6 uses for the board).

## 1. Scope

**In:** coach score entry (log for any athlete), server-authoritative timer (For Time / AMRAP / EMOM / Tabata) with persisted state, timer pushed to TVs over the M6 SSE, the `/coach/classes/:id/run` runner screen (roster strip + timer + score grid), full test tiers, Flyway V9.
**Out (M7.5+):** manual per-TV view command, heats/teams, an offline IndexedDB replay queue (M7 grid is optimistic + per-cell retry), timer sound/beeps on the TV (visual only in M7).

## 2. UX

### Runner — `/coach/classes/:id/run` (COACH|BOX_ADMIN)
One screen, three zones top→bottom (the phases of running a class):
1. **Roster strip** — compact reuse of the M5 check-in grid: avatar + name + state (booked / checked-in / no-show), tap to check in, long-press no-show. Horizontal scroll; the pre-class check-in page (`/checkin`) stays for arrivals, the runner strip is the in-class quick-glance + late check-in.
2. **Timer** — arm control: pick the piece to time (defaults to the last scoreable piece — the metcon) and the type (defaults from its WOD: `FOR_TIME`→For Time using `timeCapSeconds`, `AMRAP`→AMRAP, else coach picks). EMOM/Tabata reveal rounds + work/rest fields. Then Start / Pause / Resume / Reset. The running clock renders locally (see §5) — big, tabular. Coach's control is REST; the clock never streams.
3. **Score grid** — a piece selector (scoreable pieces) + one row per rostered athlete: name + a compact input matching the piece's score type (mm:ss / rounds+reps / load / done), Save. Tap athlete → enter → the next athlete's input focuses. Optimistic: the cell paints saved immediately; a failed save marks the cell with an inline retry, value preserved (no data loss, no queue). A cell already scored shows the value and is editable.

### TV — `/tv` (extends M6)
- **Timer idle (no active timer):** the M6 80/20 board, unchanged.
- **Timer RUNNING/PAUSED:** left 80% becomes the giant clock (renders locally from `startAtEpoch` + spec, §5) with the timed piece's name + body lines beneath it ("what we're doing"); the 20% people/results rail stays. PAUSED dims the clock + shows a "paused" eyebrow. When the timer is Reset/DONE, the board returns.
- Reconnect-safe: a TV that joins mid-AMRAP gets `{spec, startAtEpoch, status}` in its next snapshot and renders the correct remaining time from its own clock.

## 3. Architecture

No new package — the runner spans `performance` (scores) and `display` (timer, which owns the SSE + TvState). No cross-module entity references; services talk via method calls as today.

### Data — Flyway V9
```sql
alter table wod_scores add column logged_by uuid;   -- membership id of who entered it; null = athlete self-log

create table class_timers (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null,                 -- @TenantId
  session_id uuid not null references class_sessions(id),
  session_item_id uuid,                 -- the piece being timed (caption on TV); null = whole class
  spec_json jsonb not null,             -- {type,totalSeconds,rounds,workSeconds,restSeconds}
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','PAUSED','DONE')),
  started_at_epoch bigint,              -- ms; when the current run segment started (null unless RUNNING)
  paused_elapsed_ms bigint not null default 0,  -- accumulated elapsed across pause/resume
  updated_at timestamptz not null default now()
);
create unique index class_timers_session_key on class_timers (session_id);
```
`class_timers` **is `@TenantId`** (`box_id`) — always coach-box-scoped, no tenant-agnostic access, so it sidesteps gotcha #1. One timer per session (unique index); arming a new spec reuses the row.

### Timer state machine (`display.TimerService`)
- **arm(sessionId, itemId, spec)** → upsert the row PENDING with the spec, `paused_elapsed_ms=0`, `started_at_epoch=null`.
- **start** → RUNNING, `started_at_epoch = now`. **pause** → PAUSED, `paused_elapsed_ms += now - started_at_epoch`, `started_at_epoch=null`. **resume** → RUNNING, `started_at_epoch = now`. **reset** → PENDING, elapsed 0, `started_at_epoch=null`.
- Effective elapsed at read time = `paused_elapsed_ms + (RUNNING ? now - started_at_epoch : 0)`. The client computes remaining/phase from `spec` + elapsed; the server never ticks.
- **DONE** is set lazily: when composed elapsed ≥ the spec's total run length (For Time cap / AMRAP total / EMOM rounds×interval / Tabata rounds×(work+rest)), the TV/coach render "time" and the state reads DONE — no server timer needed. (The row flips to DONE on the next transition or sweep; render doesn't depend on it.)
- Every transition publishes `TvStateChanged(boxId)` → the M6 SSE pushes the new snapshot.

### Coach score entry (`performance.ScoreService`)
- `upsertFor(itemId, membershipId, input, loggedByMembershipId)` — same upsert as self-log but the target membership comes from the path (a real roster member of this box, validated), and `logged_by` is set to the coach's membership. Reuses `loggableItem` (PUBLISHED + scoreable). Publishes `TvStateChanged` (rail re-ranks).
- The self-log path (`upsert`, caller membership) is unchanged. If both exist for one (item, membership), it's one row — last write wins; `logged_by` records the last writer. An athlete can still edit their own coach-entered score and vice-versa (acceptable; noted).

### Endpoints
- `POST /api/box/sessions/items/{itemId}/score/{membershipId}` — coach entry, `RoleGuard.requireStaff()`. Body = existing `ScoreRequest`. Validates the target membership belongs to the caller's box (cross-tenant-denied).
- `GET /api/box/sessions/{id}/timer` → `{spec, status, startAtEpoch, pausedElapsedMs, sessionItemId}` (or 204 when none).
- `POST /api/box/sessions/{id}/timer` — `{action: 'ARM'|'START'|'PAUSE'|'RESUME'|'RESET', itemId?, spec?}` (staff). Returns the new timer state.
- `GET /api/box/sessions/{id}/roster` — **extended** to include `membershipId` on each `RosterEntry` (the grid writes scores by membership). Small additive change; existing callers ignore the new field.

### TvState (`display.TvStateService.compose`)
Grows one field:
```
timer: { type, totalSeconds, rounds, workSeconds, restSeconds, startAtEpoch, status, pieceTitle, pieceBody } | null
```
Non-null only when the session's timer is RUNNING or PAUSED. `pieceTitle/pieceBody` come from the timed `session_item`'s WOD. The TV renders the timer branch when this is present, else the board.

## 4. Frontend

- `features/coach/runner.page.ts` — the `/coach/classes/:id/run` screen (roster strip + timer + score grid). Route added under coach; a "Run" action on the coach Classes row (next to Build / Check-in).
- `features/coach/coach-runner.service.ts` — timer control + roster + coach score-entry calls.
- `features/performance/score-grid.component.ts` — the per-athlete grid for one piece (reuses the score-type input shapes from `score-form`, compact; optimistic + retry).
- `ui/timer.ts` — a **pure** render function `renderTimer(spec, startAtEpoch, status, nowMs) → { display: string, phase: string, done: boolean }` handling all four types. Shared by the runner and the TV so they render identically. Unit-tested in isolation (no component).
- `features/tv/tv-shell.page.ts` — add the timer branch: when `state.timer` is active, render the giant clock (driving `renderTimer` off a local 1s tick) + piece caption in the 80% column; rail unchanged. Hero surface, tokens only, vh scale, `--red` only on the live dot / last-10-seconds cue.
- Design law: runner is plumbing-register-excellent (states, inline errors, `--tap` targets); the TV timer is hero.

## 5. Timer rendering (shared, pure)

Given `spec`, `startAtEpoch`, `status`, `nowMs`, elapsed = `pausedElapsedMs + (RUNNING ? nowMs - startAtEpoch : 0)`:
- **For Time:** count **up** `elapsed`, cap at `totalSeconds` → shows `mm:ss`, `done` at cap.
- **AMRAP:** count **down** `totalSeconds - elapsed` → `mm:ss`, `done` at 0.
- **EMOM:** `round = floor(elapsed / workSeconds) + 1` of `rounds`; seconds into the current minute `workSeconds - (elapsed % workSeconds)`; `done` when `round > rounds`.
- **Tabata:** cycle = `workSeconds + restSeconds`; within a cycle, `elapsed % cycle < workSeconds` → WORK phase counting down, else REST; `round = floor(elapsed / cycle) + 1` of `rounds`; `done` when `round > rounds`.
Returns the big `display` string + a `phase` label ("WORK"/"REST"/"ROUND 3/8"/"" ) + `done`. Deterministic → fully unit-testable at fixed `nowMs`.

## 6. Testing

- **Backend:** coach score entry (happy; athlete 403; cross-tenant target membership denied; self-vs-coach last-write + `logged_by`); timer transitions (arm→start→pause→resume→reset, elapsed accounting across pause); `TvState.timer` composition (running → field present with piece caption; idle → null); roster carries `membershipId`. Testcontainers as usual; every box endpoint keeps happy+auth-denied+cross-tenant-denied.
- **Frontend Karma:** `renderTimer` for all four types at several `nowMs` points incl. boundaries (cap, 0, round rollover, work→rest); score-grid optimistic paint + retry-on-error; runner page wiring; TV timer branch renders clock + caption when `state.timer` set.
- **e2e (serial):** coach opens the runner, arms + starts a timer, logs a score for an athlete via the grid; a second (TV) context paired to the box shows the running clock and the piece caption.

## 7. M7.5 / later seams (build nothing)
- `tv_devices` gains a `view` column → manual per-device command picks board / leaderboard / timer for a specific TV (M7 auto-drives all TVs identically).
- Heats/teams: a `heat`/`team` grouping on the roster + a team score model — the runner's roster strip is where it slots in.
- Timer audio (beeps/last-3 countdown) on the TV — visual only in M7.
