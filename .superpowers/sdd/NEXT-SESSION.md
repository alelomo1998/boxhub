# Next session — **M17a, mid-milestone: Book is signed off, coach Classes is next**

| | |
|---|---|
| Branch | **`m17a-athlete-daily`** — 17 commits ahead of `main`, tree clean, NOT merged |
| Spec | `docs/superpowers/specs/2026-09-17-m17a-athlete-daily-design.md` (**living** — shape decisions written back per screen) |
| Plan | `docs/superpowers/plans/2026-09-17-m17a-athlete-daily.md` (Tasks 1–17; 1, 1b, 2, 3, 4, 5, 6, 7, 8 done) |
| Ledger | `.superpowers/sdd/2026-09-17-m17a-athlete-daily/progress.md` — per-task completions, rulings, briefs, reports |
| Backend | **864 / 0 / 0 / 0** (orchestrator-run at `6390f52`) |
| Karma | **1068 SUCCESS** (orchestrator-run at `b7ab668`) |
| Build | **0 warnings** |
| e2e | **NOT run since M14c-b.** Locators were edited in Task 8 (`.card` → `[data-testid^="session-"]`); a `down -v` run is owed. |
| Visual | `class-card` has NO baselines yet — `e2e/visual.sh` owed (the gallery gained a section). |

**Never quote these numbers — re-run them first.**

## Done so far (all reviewed by the orchestrator, gates re-run by it)

- **Backend:** `imagePath`, `coachAvatarPath` and the first five `people` on the session list; booking
  409s name the plan limit that bound (`ENTRIES_PER_WEEK`, …, `CANCELLATIONS_*` — `LIMIT_REACHED` is
  gone); Home gained `hasActivePlan`, `attendedThisWeek` (box timezone) and a habit `suggestion`.
- **Shared frontend logic:** `features/booking/class-state.ts` (`athleteState` — every past-day /
  started / checked-in rule, unit-tested) and `booking-reason.ts` (409 code → copy).
- **`ui/class-card`** — the shared card, shape A2, in the dev gallery with its ledger.
- **Athlete Book** rebuilt on it and **signed off by the user 2026-09-18**.
- **Dev seed ships real photos** (3 class, 4 portraits) and today's demo classes carry a class type.

## Owed on Book before the milestone closes

The impeccable routine is **not finished for Book**: `audit` (≥16/20) and `critique` (≥32/40, in
Chrome) have NOT run. Do them before or alongside Task 10 — the user has signed off the composition,
which is the *sign-off* step, not the scoring steps.

## Next: plan Task 10 — coach Classes on the same card

Same card, coach actions (Check-in always; Build and Run only when `!isPastDay`), Draft/Published in
the badge, meta "8/12 booked · n in line". Then Tasks 11–17 (gates, class detail, Home, e2e, close).

## Rules the user ruled DURING this milestone (all binding, all in CLAUDE.md)

1. **Shape is RENDERED, never described** — options are HTML sketches served locally + a Playwright
   PNG, iterated as new files, vendored and indexed on decision (`docs/superpowers/sketches/m17a-*`).
2. **Every screen carries a visible `<h1>`** naming it, matching dock label and `route.title`. Ten
   pre-existing offenders filed in `docs/BACKLOG.md`; a screen adds its own when rebuilt.
3. **A screen that is not a dock tab is a detail screen:** no dock, a back arrow to the tab it came
   from, the bottom gutter reclaimed, `<h1>` still present. **M17a decides the mechanism on class
   detail (Task 12)** and every later screen follows it.
4. **Booking outcomes are a bottom `bh-banner`**, never card-inline: green for book/waitlist, **red
   for cancel/leave**, red for failures. A failed *load* keeps its own stateline.
5. **Cancelling is confirmed in a `bh-sheet`** (danger-bordered ghost opens it, filled danger
   executes), and the sheet's buttons fill the width.
6. **Card actions:** Book `solid`, Join waitlist `ghost`, Cancel/Leave `ghost-danger`. `--good` is a
   status colour, never an action.
7. **The class card's scrim is light and NOT adaptive** — the user rejected both a darker and an
   adaptive scrim. Known, accepted cost: a title over a very bright upload measured **3.4:1** on
   pure white. The audit WILL flag it; it is a recorded decision, not an open P1.

## Traps hit this milestone (beyond the standing list)

- **The dev stack serves built images.** A screen only changes after
  `docker build -f docker/frontend.Dockerfile -t docker-frontend:latest . && docker compose up -d --no-deps --no-build frontend`
  (same for `backend.Dockerfile`/`docker-backend`). A **stale backend** container served a session
  list without `people` and blanked a card — the card now tolerates that (`?? []`), but rebuild BOTH
  when the wire changes. While an executor is mid-edit, build from a git worktree at HEAD instead of
  the working tree.
- **`down -v` wipes the past classes** (they are hand-seeded, not part of the seed). The SQL is in
  the M14c-b notes in `.superpowers/sdd/progress.md`; **add `schedule_slot_id` to both SELECTs** or
  the copies have no photo.
- **Claude in Chrome cannot type a password** and its window will not go below ~500px. Sign-in and
  any ≤393px pass go through a throwaway Playwright script run from `e2e/` (that folder has the
  `@playwright/test` dependency; a script in /tmp cannot resolve it).
- **A signal cleared and re-set in the same tick never remounts** — `set(null); set(x)` both land
  before render, so `role="alert"` does not re-announce. Use a seq-keyed `@for`.
- **`bh-sheet` is `showModal()`** — the top layer paints over any `position: fixed` banner, so an
  outcome banner is invisible while a sheet is open. Close the sheet, then show it.
- The impeccable design hook flags the decision sketches; they are suppressed per file in
  `.impeccable/config.json`.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M17a.

cd ~/dev/boxhub && git checkout m17a-athlete-daily && git status
# expect a CLEAN tree at b52c32c (17 commits ahead of main, NOT merged).

FIRST, confirm the baselines yourself — never quote them from the handoff:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test          # expect 864/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless   # expect 1068 SUCCESS
  cd frontend && env -u NODE_OPTIONS npm run build                        # expect zero warnings

THEN, in this order:
1. Finish the routine on athlete Book: /impeccable audit (≥16/20) → fix every P0/P1 → /impeccable
   critique (≥32/40) with Claude in Chrome connected. The scrim's 3.4:1 on a very bright photo is a
   RECORDED USER DECISION, not a P1 — say so rather than "fixing" it.
2. Plan Task 10 — coach Classes on the shared class card (same card, coach actions). Then Tasks
   11–17.

Process, unchanged: ALWAYS a Sonnet subagent per plan task with a short brief pointing at the plan;
executors never commit; the orchestrator reviews every diff and runs every gate itself. A new
screen's shape is RENDERED as options in the browser, never described. Verify navigation by
clicking, never by asserting route config.

The dev stack serves BUILT images — rebuild the frontend (and the backend when the wire changed)
before looking at anything, and note that `down -v` wipes the hand-seeded past classes.
```
