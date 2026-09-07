# Next session — **M14c-a is IN PROGRESS on `m14c-a-builder`. Continue at Task 9.**

| | |
|---|---|
| Branch | **`m14c-a-builder`**, pushed. `main` is at `ee19a35` and also pushed. |
| Spec | `docs/superpowers/specs/2026-09-07-m14c-a-builder-design.md` |
| Plan | `docs/superpowers/plans/2026-09-07-m14c-a-builder.md` — **17 tasks**, 1–8 done |
| Backend suite | **798 / 0 / 0 / 0**, `BUILD SUCCESS` (last verified at `e8669c5`; nothing since has touched backend) |
| Karma | **666 SUCCESS** |
| Production build | clean, **zero warnings** |
| Playwright | **not run yet this milestone** — Task 13 |
| Visual baselines | **one MISSING**: `sortable-list` has no snapshot. Task 13 Step 0. |

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and CONTINUE M14c-a at Task 9.

cd ~/dev/boxhub && git checkout m14c-a-builder && git status
# expect a CLEAN tree at 65b2c66, branch already pushed

Do NOT re-plan and do NOT re-spec. The spec and the plan exist and are
approved:
  docs/superpowers/specs/2026-09-07-m14c-a-builder-design.md
  docs/superpowers/plans/2026-09-07-m14c-a-builder.md
Tasks 1-8 are committed and independently verified. Start at Task 9.

Remaining: 9 (frontend wire), 10 (piece editor), 11 (class stack),
12 (athlete reader + team scoring), 13 (e2e), 14 (close the records).

ALWAYS SUBAGENT. One executor per plan task, model chosen per task -- Opus
where a wrong diff is expensive (screens, anything touching scores), Sonnet
for mechanical work. The orchestrator reviews every diff, runs every gate
itself, and commits. NEVER accept an executor's reported test numbers: run
the suite yourself and read the real line.

THE SCREEN FLOW IS BINDING AND THE USER RESTATED IT 2026-09-07:
  build -> USER LOOKS AND SAYS OK -> audit (>=16/20) -> critique (>=32/40)
        -> fix every P0/P1 -> RE-SCORE BOTH
The user's look sits BETWEEN build and audit and is a gate, not a courtesy.
Hand over a click path (URL + which demo account) and WAIT. Do not run audit
or critique on an unapproved composition. Expect 3-5 look-and-adjust rounds
per screen; every one has found a real defect. You are authorised to sign
into the dev stack with the demo accounts yourself.

Baselines to confirm before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 798/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 798/0/0/0, TOTAL: 666 SUCCESS, zero warnings. The "Mailer ... port:
localhost, 1025" ERROR lines are pre-existing SMTP noise -- judge only by
"Tests run:" and "BUILD SUCCESS".

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw; JAVA_HOME=/opt/homebrew/opt/openjdk@21. NEVER chain a grep gate
with && -- a grep that correctly finds nothing exits 1 and aborts the chain.
Compose from the repo root (docker/docker-compose.yml), Playwright from e2e/.
Rebuild the frontend image and verify your change is in the SERVED bundle
before any browser pass or e2e run; the image does not rebuild itself.

TELL EVERY EXECUTOR, IN THE BRIEF: run maven and npm in the FOREGROUND with
timeout 900000. Seven executors stalled this milestone by backgrounding a
test run and ending their turn to wait for it, one of them after being told
not to. It costs a full round-trip each time.

Five things that cost real time here and will again:
- Reverting a file with `mv file.bak file` restores its OLD MTIME, so Maven
  skips recompiling and you test the broken class. touch after any
  revert-by-restore. Tasks that say "break the fix and watch it fail" all
  hit this.
- Green Karma is NOT evidence the build compiles. AOT rejected a private
  field referenced from a template that Karma's JIT accepted. Run
  `npm run build` too, every time.
- The plan's predicted test counts are guidance, not gates. Judge by
  "Failures: 0" and "BUILD SUCCESS", never by matching a number.
- The plan's test helpers are ILLUSTRATIVE. Working MockMvc + JWT harnesses
  now exist in WodAxesWireTest, WodLibraryListTest, WodGrowthTest,
  TeamScoreTest. Read one and follow it; do not invent another.
- Repository reads from a test thread need TenantContext.runAsBox(boxId,...).
  @TenantId entities fail CLOSED post-M21, so a bare count() returns 0 and
  every emptiness assertion passes vacuously.

A backtick inside a comment in an Angular `template:`/`styles:` literal
closes the string, and a backtick in a bash -m commit message runs command
substitution and silently eats the word. Use plain words in template
comments and write commit messages through a quoted heredoc.
```

---

## What is done — 8 tasks, every one verified by the orchestrator, not by its executor

| Task | Commit | What it did |
|---|---|---|
| 1 | `dbd6438` | **V33** migration: `wod.source_wod_id/team_size/team_share`, `wod_score.team_id/team_name` |
| 2 | `7481c34` | The **additive wire** — DTO carries `macro`/`timingPreset`/`timing`/`library`/team; an explicit macro wins over legacy `wodType`. **Closes the CIRCUIT/CUSTOM/SKILL type loss.** Also **scaling options**: a line carries a LIST of `Scale`, with the legacy free-text `scaling` normalised on read |
| 3 | `e978f55` | `GET /api/box/wods` filters `library = true` |
| 4 | `edf6baf` | **The growth fix.** Attach copies, edits patch the copy, `saveToLibrary` uses `source_wod_id` to update in place. `promoteToLibrary` deleted |
| 5 | `a6fb123` | **Team scoring** — one result, N rows sharing a `team_id` |
| 5A | `e8669c5` | **`PROGRAMMING_PUBLISHED`** fires to the booked roster on publish |
| 5B | `31835ea` | Its athlete-facing **copy** + a new `training` prefs group |
| 6 | `f48383b` | **`bh-sortable-list`** — long-press drag + full keyboard reorder |
| 6A | `7108bea` | Its rows became `listitem` so they may carry their own controls |
| 7 | `e7fbf78` | `bh-segmented` gains `wrap` and a `bone` tone |
| 8 | `65b2c66` | **`bh-pick-sheet`** — replaces the native `datalist` |

**M14a had built the model and left it unreachable.** Two-level blocks, the segment sequence, TABATA,
`wod.library` and `attachToSession` all existed and were referenced only by one test. Most of Tasks
1–5 was wiring what was already there, which is why the migration is one small additive file.

## Two API contracts Tasks 10 and 11 must honour

**`bh-sortable-list`** — generic in `T`. `items` (required), `label`, `itemLabel: (item, index) => string`, `(reordered)` emitting `{from, to}`. **Presentational: it never mutates `items()`** — the consumer splices its own array. Row template context is `{ $implicit: item, index }`. Rows are `role="listitem"` and **may** contain buttons/links. Hold the `itemLabel` labeller as a **class field**, not an inline arrow, or you mint a new function identity every change-detection cycle.

**`bh-pick-sheet`** — `open` (one-way input), `title`, `rows: PickRow[]`, `allowFreeText`, `searchLabel`, `searchPlaceholder`; outputs `(search)` (debounced term), `(picked)` (`{id}` or `{freeText}`), `(closed)`. Testids: `pick-search`, `pick-row-<id>`, `pick-free-text`.
- **Reset your own `open` signal to `false` on BOTH `(closed)` and `(picked)`** — the component never clears it, and a stuck-true signal will not reopen the sheet.
- **It does not filter.** `(search)` hands you the debounced term; you fetch or filter and push back through `[rows]`. **Ruled: keep it that way for both consumers** — the movement picker searches server-side, and `programming.service.wods(search)` already does the same for the library, so a second client-side filter would hide rows the server matched on an alias.

## Corrections executors found in the plan — all four were the executor being right

1. **`columnExists` is not inherited** from `AbstractIntegrationTest`; each migration test declares its own (4 files already do). Fixed in `38fc3a5`.
2. **The route is `coach/classes/:id/build`**, which already exists and is linked from `classes.page.ts:47` — not the `/coach/build/:sessionId` the spec first proposed. The piece editor is a child route beneath it.
3. **`promoteToLibrary` had ZERO callers and ZERO tests**, not "referenced only in `WodLibraryCopyTest`". Deleting it lost no coverage. Fixed in `dffd45c`.
4. **The plan's `@NotEmpty` on `membershipIds` would have failed the authz sweep** — bean validation runs before the handler, so it would 400 before the tenancy check, which is exactly the "validation ran before authz" hole the sweep hunts. Dropped; the count is checked in the handler against the piece's own `team_size`.

Also corrected: Task 5A's Step 7 named the wrong test as the one that goes red (the rollback test's own `TransactionTemplate` supplies the transaction, so the five happy-path tests are what fail).

## The pattern worth carrying into the remaining tasks

**Three times this milestone, something was authored with no reader — and every gate stayed green.**

- `bh-score-form`'s completion branch is unreachable: `athlete/wod.page.ts:50,179` gate on `scoreType !== 'NONE'`. **Task 12 fixes it.**
- `athlete/wod.page.ts:39-46` renders blocks ONE level deep and never renders `blk.blocks` or a line's scaling. Nothing could author either until now. **Task 12 fixes it.**
- `PROGRAMMING_PUBLISHED` shipped with no frontend copy, and both consumers have a generic fallback so nothing crashed. The copy spec hardcodes its own type list, so Karma stayed green. **Task 5B fixed it.**

**The gates catch "broken", never "absent".** For each remaining task ask: *who reads what this writes, and can they?*

## Open, filed, NOT fixed

- **`ScoreDto` does not echo `teamId`/`teamName`.** Flagged during Task 5; check whether Task 12's UI needs it before widening.
- **The `sortable-list` visual baseline does not exist.** Task 13 Step 0 — run `e2e/visual.sh` (Linux container), never Playwright locally.
- Everything in spec §10: timer auto-arm → M34, the admin entry point → M15b, the library/benchmarks/types pages → M14c-b, roster team-splitting → Project 2, and the seven remaining `wodType` consumers.
