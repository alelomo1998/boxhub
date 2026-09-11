# Next session — **M14c-a is IN PROGRESS on `m14c-a-builder`. The piece editor is DONE and signed off. Task 11 is next and needs a SHAPE PASS first.**

| | |
|---|---|
| Branch | **`m14c-a-builder`**, pushed, HEAD `04c04e9`. `main` at `ee19a35`. |
| Spec | `docs/superpowers/specs/2026-09-07-m14c-a-builder-design.md` |
| Plan | `docs/superpowers/plans/2026-09-07-m14c-a-builder.md` — **17 tasks; 1–10 and 12 done** |
| Backend | **821 / 0 / 0 / 0**, `BUILD SUCCESS` |
| Karma | **784 SUCCESS** |
| Production build | clean, **zero warnings** |
| Playwright | **STILL not run this milestone** — Task 13. See the warning below. |
| Visual baselines | `sortable-list` still has **no snapshot**. Task 13 Step 0. |
| Piece editor | **signed off by the user.** `audit` **19/20** (gate 16), `critique` **35/40** (gate 32). |

---

## What is actually left

**Task 11 — the class stack.** The only substantial build remaining. A new screen at
`coach/classes/:id/build` replacing `instance-builder.page.ts`. **The user's rule: a new screen gets
3–4 real layout options to choose from BEFORE it is built.** Skipping that on the piece editor cost
six rounds of rework. Do not skip it again. Read `instance-builder.page.ts`'s `seedFromSkeleton`
before deleting the file — the skeleton pre-seed (a standard class type produces empty labelled
slots the coach fills) is behaviour the user validated on the tour and it carries across.

**Task 13 — e2e.** Step 0 regenerates the `sortable-list` visual baseline via `e2e/visual.sh` (the
Linux container — **never Playwright locally**, or you compare against baselines your renderer never
wrote). Then the wiring Karma structurally cannot see: open a class → tap a piece → edit → save →
**reload** → confirm it persisted.

**Task 14 — close the records.** `docs/BACKLOG.md`, `docs/ROADMAP-AT-A-GLANCE.md` row 10,
`.superpowers/sdd/progress.md`, and rewrite this file.

---

## ⚠️ The e2e suite has not run once this milestone

Task 13 expects a baseline of **91 passed**. Since that baseline was set, this milestone has changed
a **shared `ui/` component** (`bh-sortable-list`, substantially — see below), **two forms**, and the
**wod JSON model**. If any of that broke another screen's selectors, nobody knows yet. Budget for
it; do not assume Task 13 is a formality.

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and CONTINUE M14c-a.

cd ~/dev/boxhub && git checkout m14c-a-builder && git status
# expect a CLEAN tree at 04c04e9, branch pushed

Do NOT re-plan and do NOT re-spec. Tasks 1-10 and 12 are committed and were
verified by the orchestrator, not by their executors. THE PIECE EDITOR IS DONE
AND SIGNED OFF -- audit 19/20, critique 35/40. Do not reopen it, do not re-score
it, do not "improve" it unless the user asks.

FIRST ACTION: confirm the baselines yourself, then START TASK 11 WITH A SHAPE
PASS -- 3-4 real layout options with little ASCII previews, presented to the
user for a choice, BEFORE any code. That step was skipped on the piece editor
and cost six rounds of rework. It is not optional.

  cd ~/dev/boxhub && docker compose -f docker/docker-compose.yml up -d --build
  # http://localhost/app/coach/wods/new   as coach@demo.io / boxhub-demo-2026

Task 11 is the class stack at coach/classes/:id/build, replacing
instance-builder.page.ts. Read its seedFromSkeleton BEFORE deleting it -- the
skeleton pre-seed is behaviour the user validated on the tour.

Then Task 13 (e2e) and Task 14 (records).

ALWAYS SUBAGENT. One executor per task. The orchestrator dispatches, reviews
every diff, runs every gate ITSELF, and commits. NEVER accept an executor's
reported test numbers -- run the suite yourself and read the real line. That
rule paid out this session: the handoff's backend number was stale and the
suite was actually RED.

SUBAGENTS STALL ON THIS REPO. What survives is a SHORT brief naming ONE file
with the detail in a contract file on disk that the brief points at. Long
inline briefs stall. Write the contract to $CLAUDE_JOB_DIR/tmp/<name>.md.
Tell every executor to IGNORE the graphify PreToolUse hook -- it orders them to
run `graphify query` before reading and they burn whole turns obeying it.
Tell them to run maven and npm in the FOREGROUND with timeout 900000.
Tell them to leave the docker stack UP -- one tore it down and the user could
not open the page.

MEASURE AT MORE THAN ONE WIDTH. Three separate defects shipped this session
because a change was verified at a single viewport. Any layout change gets
measured at 320 / 360 / 393 / 768 / 1024 / 1280 before it is called done.

Baselines to confirm before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 821/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 821/0/0/0, TOTAL: 784 SUCCESS, zero warnings. The "Mailer ... port:
localhost, 1025" ERROR lines are pre-existing SMTP noise -- judge only by
"Tests run:" and "BUILD SUCCESS".

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw; JAVA_HOME=/opt/homebrew/opt/openjdk@21. NEVER chain a grep gate
with && -- a grep that correctly finds nothing exits 1 and aborts the chain.
Compose from the repo root (docker/docker-compose.yml), Playwright from e2e/.
THE BACKEND IMAGE NEEDS `up -d --build` -- the jar is baked in with no source
mount, so a new migration does NOT reach a running container otherwise. This
cost a debugging detour when the box weight unit came back undefined.

A backtick inside a comment in an Angular `template:`/`styles:` literal closes
the string, and a backtick in a bash -m commit message runs command
substitution. Write commit messages through a quoted heredoc.
```

---

## What the user ruled on the builder — binding, do not relitigate

Carried forward from the previous handoff, still binding:

1. **The builder is on the HERO list** (2026-09-08). Volt is available here, bounded by area, one
   question per element.
2. **Shape: header strip + block canvas.** Title, then ONE meta strip of four chips
   (WHAT / HOW / SCORE / WHO) each opening a sheet, then segments, then THE WORK, then save.
3. **Sheets are full-width rows at `--tap-lg`, and close on pick.** No segmented pills in a sheet.
4. **`HOW` has a `None` row.**
5. **The segment sequence is drawn on the PAGE, not inside the picker.**
6. **Add affordances are full width, plain verbs**, no `+` glyph.
7. **A new piece opens with one block already.**
8. ~~No rep-scheme field; reps is free text.~~ **SUPERSEDED 2026-09-10 — see ruling 13.**
9. **`+ part` (the second nesting level) is removed from the UI.** The model and the athlete reader
   keep it; existing sub-blocks still render read-only.
10. **Reorder ONLY when a block is collapsed.**
11. **`WHO` reads `1`**, not `SOLO`.
12. **Weight unit is box-level** (V34, `boxes.weight_unit`, KG default).

New this session:

13. **Reps and load take NUMBERS ONLY, entered through a stepper** (2026-09-10). This reverses
    ruling 8 — the user chose it knowing Fran's `21-15-9` then lives in the movement text. The
    stepper's value is a raw STRING so a library wod carrying free-text reps still renders instead
    of silently blanking on open. Load allows one decimal; reps does not.
14. **Only EMOM, Tabata and Interval get a segments list.** A segment means *a block plus a
    duration*, so it only means anything for a repeating pattern. For time and AMRAP get a
    cap/duration written to `timeCapSeconds` instead — a field the live class runner already read
    and this screen had never set.
15. **A WORK segment names the block it runs** (`blockIndex`), so the TV can show the right
    prescription. The index is remapped by every op that changes the shape of `blocks`.
16. **Copy a block, paste it as a new one. No replace, no cut.** The clipboard is ONE slot and is
    **cleared on paste** — pasting the same block twice means pressing copy twice (user-ruled).
17. **A movement declares which units it may be measured in, and whether it takes a load.**
    Assault bike offers CAL, a burpee offers REPS only and no load at all. Imperial lives in the
    unit list itself (`M,KM,MI,FT`), **not** a box-wide toggle — a box-level switch would relabel a
    500 m row as 500 ft without converting it.
18. **Every picker is a `bh-sheet`, never a native select or combo.** Creating a movement is a
    SECOND STEP INSIDE the same sheet, not a sheet stacked on a sheet.
19. **The WHAT chip keeps volt** (ruled by the orchestrator 2026-09-10, user delegated). The
    design law's "taxonomy does not qualify" line excludes labels *about* a subject; the macro IS
    the subject, and it is the first question the screen answers.
20. **Reorder motion: 500ms, symmetric ease-in-out, swap fires at 18% of a neighbour.** The user
    tuned all three by eye and said to leave the duration alone.

---

## `bh-sortable-list` was substantially rewritten — read this before touching it

It no longer reorders rows during a drag. Rows hold their slots and are **translated**; the
consumer's array is only reordered on drop. Consequences a future change must respect:

- **Hit-testing reads geometry cached at grab**, never live `getBoundingClientRect()`. A
  transformed element reports its *transformed* box, so live reads describe the animation and make
  the target index oscillate.
- **The drop clears transforms with transitions suppressed for one frame** (a `settling` class, a
  double `requestAnimationFrame`). This is the whole trick: the consumer's re-render puts each
  item's content exactly where its transform was already showing it, so an instant reset produces
  no visible movement. Tween that reset and every row animates away from where the coach dropped
  it — which is precisely the bug the user reported as "the switch is fake".
- **Escape and a no-op drop deliberately KEEP their tween.** Nothing reordered there, so the rows
  genuinely do have to travel back.
- The grabbed row carries `position: relative; z-index: 1`. Without it, paint order is DOM order and
  a block dragged *downward* slides underneath the ones it passes.

---

## Open, filed, NOT fixed

- **A collapsed block's name field is 38px wide at 320px** (78px at 360), against ~175px of typical
  content. It got *worse* in the critique-P1 fix, which widened the bar's gap and gave remove a
  border. **The user was offered the fix and has not answered:** when collapsed, render the name as
  plain text rather than an editable field, and keep it editable only when expanded — one fewer
  control in a row whose job is "drag me", and the name gets the full width.
- **The hero title still clips** past ~16 characters at 360px (measured: 693px of content in a
  328px field). Stepped down a type size below 360px, which helps and does not solve. A real fix is
  wrapping to two lines, which is a shape change and therefore the user's call.
- **Help/documentation heuristic scored 2** — there is none anywhere on the screen. Acceptable for
  an expert tool; recorded because it was scored as observed.
- **The create-movement step inside the picker was never opened by a review pass.** Both `audit`
  and `critique` targeted the piece editor, and the review agent built its piece by picking an
  existing movement, so the free-text path — a second screen inside a sheet, reachable only after a
  search misses — was never walked. It had three defects: a 403 for coaches, mismatched action
  buttons, and an invented `OTHER` category. All fixed in `04c04e9`. **The lesson: a surface that
  only appears after a miss needs to be named as its own target, or a scored pass will skip it.**
- **`WodJsonValidator` does not cross-check `blockIndex` against the block list**, and does not
  check a scale's unit against its movement's allowed list. Both are deliberate and carry
  `ponytail:` comments — the validator is a pure function with no repository. **The TV must
  tolerate an index it cannot resolve.**
- **Weight unit does not convert on switch.** KG→LB relabels rather than converts. Deliberate.
- **`ScoreDto` does not echo `teamId`/`teamName`.**
- **Collapse state is a parallel `boolean[]`**, spliced alongside `blocks` in every shape-changing
  op. Correct today; breaks silently if someone mutates `blocks` without touching it.
- Everything in spec §10: timer auto-arm → M34, admin entry point → M15b, library/benchmarks/types
  pages → M14c-b, roster team-splitting → Project 2, the seven remaining `wodType` consumers.

---

## What this session cost, so it is not repeated

**Three defects shipped because a change was measured at ONE viewport width.** The reps input
rendered 6px wide at 360; then, after that was fixed, 24px and 6px at *every* width from 760 up,
which `audit` caught only because it measures at four. A single width is not a verification.

**The backend suite was RED and the handoff said green.** `ClassReminderSchedulerTest` hardcoded
`2026-09-10T05:00:00Z` and every session it seeds goes through `BookingService.book`, which rejects
a past class — so all eight tests began erroring the moment that date passed. Nothing in this
milestone touched the file; `main` carries the same bomb. Fixed to a relative base. **This is the
argument for running the suite yourself rather than quoting the last number you saw.**

**The backend container does not pick up a new migration from `up -d`.** The jar is baked into the
image with no source mount. It served a pre-migration schema for a while, which surfaced as the box
weight unit arriving `undefined` and rendering "Load in undefined for line 1" — invisible to every
green test. Use `up -d --build`.

**`bh-button` has no output**, so `(clicked)` binds a DOM event that never fires. All 18 specs
passed while every ghost button was dead. **Karma cannot see a dead binding unless a spec presses
the real control.** Specs on this screen now press real controls; keep it that way.
