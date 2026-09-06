# Next session — **M14b is IN PROGRESS. Resume at Task 10.**

**This is a mid-milestone handoff, not a milestone close.** The branch is alive and unmerged, and
9 of 14 plan tasks are done. Do not start a new milestone.

| | |
|---|---|
| Branch | **`m14b-schedule-classes`**, 14 commits ahead of `main`, unmerged. Working tree clean. |
| Backend suite | **754 / 0 / 0 / 0**, `BUILD SUCCESS` (749 baseline + 5) |
| Karma | **626 SUCCESS** |
| Production build | clean, **zero warnings** |
| Playwright | `booking-flow`, `messaging`, `memberships` — **6 passed**. Full suite NOT yet re-run. |
| Visual baselines | **NOT yet regenerated** — Task 12 owns this and it is not done |

Spec: `docs/superpowers/specs/2026-09-05-m14b-schedule-classes-design.md`
Plan: `docs/superpowers/plans/2026-09-05-m14b-schedule-classes.md` — **14 tasks, read it first**
Progress: `.superpowers/sdd/progress.md`

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and CONTINUE M14b from Task 10.

cd ~/dev/boxhub && git checkout m14b-schedule-classes && git status
# expect a CLEAN tree, 14 commits ahead of main, and NO other branch

M14b is in progress, NOT finished. The branch already exists — do not create a
new one, do not create a worktree, do not run EnterWorktree. git worktree list
must show exactly one entry.

Tasks 1-9 are done and committed. Remaining: 10 (admin class-detail modal),
11 (e2e for the strip and the rebuilt screen), 12 (regenerate visual
baselines), 13 (docs + close the two backlog entries), 14 (full gate run,
impeccable per screen, merge and delete the branch).

The plan is docs/superpowers/plans/2026-09-05-m14b-schedule-classes.md and it
has been corrected three times against reality while executing — trust it over
the spec where they differ, and read the CORRECTED notes in Tasks 2, 4, 5 and 8.

Confirm the baselines before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 754/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 754/0/0/0, TOTAL: 626 SUCCESS, zero warnings. The "Mailer ... Couldn't
connect to host, port: localhost, 1025" ERROR lines are pre-existing SMTP
noise — judge only by "Tests run:" and "BUILD SUCCESS".

ALWAYS subagent: one Sonnet executor per plan task, review every diff
yourself, run the gates yourself, commit yourself. Executors return BEFORE
their own background suite finishes — verify from the output file, never from
the agent's summary. This bit twice in the last session: one executor reported
"625 SUCCESS" on a run that was actually 1 FAILED, and another attributed its
failures to a concurrent edit when the real cause was a race in a helper.

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw. NEVER chain a grep gate with && — a grep that correctly finds
nothing exits 1 and aborts the chain. Run each gate as its own command and
print the count. Compose from the repo root (docker/docker-compose.yml),
Playwright from e2e/. The frontend image is STALE — it predates Task 9, so
rebuild it and verify the testid is in the SERVED bundle before any browser
pass or e2e run.

The user reviews in Chrome DevTools device emulation at iPhone 16 Pro. Check
narrow (320) and short viewports before showing them anything.
```

---

## What is done (tasks 1–9, in commit order)

| Commit | What |
|---|---|
| `e33c5b9` | design spec |
| `fc3aa68` | implementation plan, 14 tasks |
| `b8d6570` | **T1** regeneration never deletes a session that has already started |
| `010c19d` | **T3** `bh-week-calendar` |
| `f5fefb9` | plan correction (T2 test scaffolding) |
| `02b5805` | **T4** gallery section + seven-state ledger |
| `dd0a659` | **T5** `tonesOf` helper; coach classes + athlete book adopt the strip |
| `530d2ba` | **T2** a slot edit regenerates instead of generating additively |
| `1bafab1` | **T7** announcements adopts the strip; `bh-day-pager` deleted |
| `c628b21`, `5a8cbfc` | plan corrections (merged T5, gallery registry, T8 helper) |
| `60082d7` | **T8** e2e drives the week strip |
| `533dd5c` | **T9** admin schedule page rebuilt |

**Task 6 does not exist any more** — it was merged into Task 5, because coach classes, athlete book
and the admin page all needed the identical `SessionView[] → Record<string, DayTone>` rollup and the
plan had written it out three times. Two parallel executors would also have raced on the same new
file.

## What remains

- **T10** the admin class-detail modal. The seam is already in place: `schedule.page.ts` has an
  `openSessionId` signal (line ~235) set by the session-row click (~314). It adds **no read
  endpoint** — `GET /api/box/sessions/{id}/detail` and `/roster` already serve everything.
- **T11** e2e for the strip and the rebuilt admin screen. **This is the task that matters most**:
  Karma cannot see a dead submit binding, and T9 moved that screen off `(ngSubmit)` — the exact
  failure that once shipped a password into the URL.
- **T12** regenerate visual baselines (`e2e/visual.sh`, Linux container, never Playwright locally).
- **T13** docs: delete `docs/BACKLOG.md`'s day-pager entry (~:331) and the `regenerateFrom` entry
  (~:774), both now fixed; add the deferred capacity item (spec decision 8); mark M14b done in
  `docs/ROADMAP-AT-A-GLANCE.md` row 9. **Write this file last, from measured numbers.**
- **T14** full gates, the impeccable routine per screen, merge, delete the branch.

**The impeccable routine has NOT been run on anything yet.** It is owed on `admin/schedule.page.ts`,
`bh-week-calendar` + its gallery section, and `coach/classes.page.ts`:
`shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH`, with Claude
in Chrome connected. `interaction-design` applies to the new component; `harden` to the admin screen.

---

## Open items found but deliberately NOT fixed

- **`admin.schedule.blocked.title` does not pluralise.** It renders
  `{{ blockingDates().length }} classes in this range have bookings.` — so a single blocking date
  reads *"1 classes"*. Real copy defect, found in review, left for the critique pass to rule on
  because ICU plural syntax is a copy decision, not a mechanical fix.
- **A capacity change regenerates rather than applying in place**, so it is refused on any slot with
  a booked session in range. Deliberate (spec decision 8) — one mechanism, not two. Belongs in
  `docs/BACKLOG.md` as part of T13.
- The stale `LIMIT_REACHED` copy and missing `CANCEL_LIMIT_REACHED` case on `book.page.ts` remain
  **M17's**, untouched on purpose.

---

## What this milestone found that the roadmap did not know

- **`PATCH /api/box/class-templates/{id}` was a LIVE defect, not the latent one the backlog
  recorded.** It accepted `weekday`/`startTime`/`capacity` and then called `generateForBox`, which
  is additive only — moving a slot left the old sessions in place and added new ones beside them,
  permanently. `COACH`-reachable; only the UI never sent those fields. Fixed in `530d2ba`.
- **A fourth `bh-day-pager` consumer**: M29a's announcements class-picker. It is what made
  "delete the old component" a real question rather than a formality.
- **`regenerateFrom`'s existing test used a FUTURE `from`** (`now + 3 days`), which is exactly why
  its unbounded-backwards delete had never been caught. Only a past `from` reaches the past.
- **The dev-gallery completeness spec hardcodes a sorted registry of every shipped component's
  `data-gallery` id.** Renaming a section fails it deterministically. That array going red is the
  registry working; swap the literal in its sorted slot and change nothing else.

## Traps that cost time here and will again

1. **An executor returns before its own suite finishes, and its numbers can be wrong.** One reported
   `625 SUCCESS` where the real result was `1 FAILED`. Verify from the output file, always.
2. **A grep gate chained with `&&` aborts when it correctly finds nothing** (exit 1).
3. **Never leave a token a gate hunts inside a comment.** Deleting `bh-day-pager` left its name in
   eight comments, which would have made the standing gate permanently non-zero and trained the next
   reader to ignore the red. Two of those comments were also simply false by then.
4. **Date-dependent tests fail one day in seven and pass every rehearsal.** A week-calendar spec
   looked for "a selectable day with a greater offset" in the default week; on a **Sunday** today is
   the last cell of a Monday-first week, so none exists. It went red at midnight, mid-session. Force
   the week (`offset.set(7)` is fully selectable for any starting weekday) instead of hoping.
   The same class of bug hit the gallery ledger: `disabled: rendered` was only true when today was
   not a Monday, fixed by adding a second strip bounded to `max=2`.
5. **A day past `max()` is still RENDERED, carrying `[disabled]`, not absent.** A `count()`-only
   check falls through into a click that hangs for the full timeout.
6. **After paging the strip a week, the DOM has not re-rendered yet.** Reading `count()` immediately
   reports the horizon exhausted while most of it is ahead — silently, since callers just stop.
7. **`runner.spec.ts:43`** still fails and is **not yours** — the TV SSE lost-push bug, owned by M37.
   Confirm from the backend log; do not add retries.
8. **The admin shell still overflows horizontally at 320/360/393** (401px floor). Pre-existing,
   in `docs/BACKLOG.md`, needs a bisect. T9's rebuild did not address it.
