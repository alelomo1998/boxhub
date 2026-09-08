# Next session — **M14c-a is IN PROGRESS on `m14c-a-builder`. The piece editor awaits the USER'S LOOK.**

| | |
|---|---|
| Branch | **`m14c-a-builder`**, pushed, HEAD `5251fe4`. `main` at `ee19a35`. |
| Spec | `docs/superpowers/specs/2026-09-07-m14c-a-builder-design.md` |
| Plan | `docs/superpowers/plans/2026-09-07-m14c-a-builder.md` — **17 tasks; 1–10 and 12 done** |
| Backend | **804 / 0 / 0 / 0**, `BUILD SUCCESS` |
| Karma | **712 SUCCESS** |
| Production build | clean, **zero warnings** |
| Playwright | **not run yet this milestone** — Task 13 |
| Visual baselines | `sortable-list` still has **no snapshot**. Task 13 Step 0. |

---

## THE ONE THING BLOCKING PROGRESS

**The piece editor has never been signed off by the user, and `audit`/`critique` must NOT run until
it is.** It has been through six rounds of the user looking and rejecting. Do not score it, do not
start Task 11, until they say the composition is right.

Click path: **http://localhost/app/coach/wods/new**, sign in `coach@demo.io` / `boxhub-demo-2026`.
Rebuild the frontend image first — it does not rebuild itself.

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and CONTINUE M14c-a.

cd ~/dev/boxhub && git checkout m14c-a-builder && git status
# expect a CLEAN tree at 5251fe4, branch pushed

Do NOT re-plan and do NOT re-spec. Tasks 1-10 and 12 are committed and
independently verified by the orchestrator, not by their executors.

FIRST ACTION: bring up the stack, rebuild the frontend image, and give the
user a click path to the piece editor. Then WAIT. The screen has never been
signed off. Do NOT run audit or critique until they approve the composition.
  cd ~/dev/boxhub && docker compose -f docker/docker-compose.yml up -d
  docker compose -f docker/docker-compose.yml build frontend
  docker compose -f docker/docker-compose.yml up -d frontend
  # http://localhost/app/coach/wods/new  as coach@demo.io / boxhub-demo-2026

Remaining: the user's sign-off -> audit (>=16/20) -> critique (>=32/40) ->
fix every P0/P1 -> re-score BOTH. Then 11 (class stack), 13 (e2e), 14 (records).

ALWAYS SUBAGENT. One executor per task. The orchestrator reviews every diff,
runs every gate itself, and commits. NEVER accept an executor's reported test
numbers -- run the suite yourself and read the real line.

SUBAGENTS STALL ON THIS REPO. Seven times last session: the agent starts,
goes silent, writes nothing, and the only cure is TaskStop and re-dispatch.
What survives: a SHORT brief naming ONE file, with the detail in a contract
file on disk that the brief points at. What stalls: long inline briefs. Write
the contract to $CLAUDE_JOB_DIR/tmp/<name>.md and keep the brief under a page.
Tell every executor to IGNORE the graphify PreToolUse hook -- it orders them
to run `graphify query` before reading, and they burn whole turns obeying it.

TELL EVERY EXECUTOR: run maven and npm in the FOREGROUND with timeout 900000.
One backgrounded a test run and ended its turn to wait for it, costing a full
round-trip.

Baselines to confirm before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 804/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 804/0/0/0, TOTAL: 712 SUCCESS, zero warnings. The "Mailer ... port:
localhost, 1025" ERROR lines are pre-existing SMTP noise -- judge only by
"Tests run:" and "BUILD SUCCESS".

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw; JAVA_HOME=/opt/homebrew/opt/openjdk@21. NEVER chain a grep gate
with && -- a grep that correctly finds nothing exits 1 and aborts the chain.
Compose from the repo root (docker/docker-compose.yml), Playwright from e2e/.

A backtick inside a comment in an Angular `template:`/`styles:` literal closes
the string, and a backtick in a bash -m commit message runs command
substitution. Write commit messages through a quoted heredoc.
```

---

## What the user ruled on the builder — binding, do not relitigate

1. **The builder is on the HERO list** (2026-09-08). `CLAUDE.md` was updated. A coach writing the
   workout is writing the WOD board, so volt is available here — bounded by area, one question per
   element. Today exactly one element uses it: the macro chip.
2. **Shape: header strip + block canvas.** Title, then ONE meta strip of four chips
   (WHAT / HOW / SCORE / WHO) each opening a sheet, then the segments card, then THE WORK, then save.
3. **Sheets are full-width rows at `--tap-lg`, and close on pick.** No segmented pills in a sheet.
4. **`HOW` has a `None` row** — a warm-up has no timing preset.
5. **The segment sequence is drawn on the PAGE, not inside the picker.**
6. **Add affordances are full width, plain verbs**, no `+` glyph.
7. **A new piece opens with one block already.**
8. **No rep-scheme field.** A line's `reps` is free text, so Fran is `Thruster 21-15-9`. The user
   corrected the modelling: Fran is ONE block with two movements, not three sub-blocks.
9. **`+ part` (the second nesting level) is removed from the UI.** The model, its methods and the
   athlete reader keep it, and existing sub-blocks still render read-only.
10. **Reorder ONLY when a block is collapsed.** Expanded renders no handle.
11. **`WHO` reads `1`**, not `SOLO`.
12. **Weight unit is box-level** (V34, `boxes.weight_unit`, KG default), shown as a suffix on load.

## Three defects found by LOOKING, that every gate passed

- **`bh-button` has NO output.** The screen bound `(clicked)`, which binds a DOM event that never
  fires, so every ghost button was dead. **All 18 specs passed** because each called the handler
  directly. Two specs now press real controls.
- **Drag did not work.** Measured in the page: press-and-drag did nothing, press + 450ms + drag
  worked. A 400ms long-press gate, plus `pointerdown` bound to the whole row (which now holds text
  inputs). Handlers moved to the handle and it lifts on contact. `touch-action` also had to be
  pinned on the handle permanently — Chrome fixes it at first contact, so flipping it when the drag
  starts is too late and a phone pans instead.
- **The movement control collapsed to ~40px at 360px**, squeezed by fixed reps/load columns.

**The pattern: the gates catch "broken", never "absent" or "wrong-looking". Karma cannot see a dead
binding unless a spec presses the actual control.**

## The containment mistake, so it is not repeated

Round 1 the block was a card and the user rejected it. I offered "cards" vs "flat rows, no nested
boxes" — **a badly framed choice.** The defect was never the border; it was that content sat
indented behind the drag handle's flex gutter, cramped, in a card inside a card. Choosing flat rows
removed the cramping and the boundary together, and the user then (correctly) reported they could
not see where a block started or ended.

They are compatible: since reordering is offered only when collapsed, an **expanded block has no
handle and therefore no gutter**. `5251fe4` makes a block a card whose header bar is pulled out over
the card padding, a line plus its scaling options one bounded unit, and the segments area a card.
**THE WORK gets no card of its own** — a card around a set of cards is the original mud.

## Open, filed, NOT fixed

- **The screen is unscored.** `audit` then `critique`, browser-connected, after the user's sign-off.
- **Collapse state is a parallel `boolean[]`**, spliced alongside `blocks` in every shape-changing
  op. Correct today, but it breaks silently if someone mutates `blocks` without touching it.
- **A collapsed block still shows its name input**, so the row is chevron · field · ✕ · summary.
  Possibly one control too many for a row whose job is "drag me".
- **`ScoreDto` does not echo `teamId`/`teamName`.**
- **`sortable-list` has no visual baseline.** Task 13 Step 0 — run `e2e/visual.sh` (Linux
  container), never Playwright locally. The component's DEFAULT rendering is unchanged by this
  milestone (verified: the dev gallery still shows 4 rows / 4 handles / 0 `align-top`).
- **Weight unit does not convert on switch.** KG→LB relabels existing numbers rather than
  converting them. Deliberate; file it if a pilot box needs otherwise.
- Everything in spec §10: timer auto-arm → M34, admin entry point → M15b, library/benchmarks/types
  pages → M14c-b, roster team-splitting → Project 2, the seven remaining `wodType` consumers.

## Task 11 has not started, and needs a shape pass FIRST

The class stack at `coach/classes/:id/build`. **The user's rule: a new screen gets 3–4 real layout
options to choose from BEFORE it is built.** That step was skipped on the piece editor and cost six
rounds of rework. Do not skip it again. `instance-builder.page.ts` is still routed and still the
live screen; read its `seedFromSkeleton` before deleting it — the skeleton pre-seed is behaviour the
user validated on the tour.
