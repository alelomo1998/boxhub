# Next session — **M14c-a: the BUILD is done and scored. Task 13 (e2e) and Task 14 (records) remain.**

| | |
|---|---|
| Branch | **`m14c-a-builder`**, HEAD `de8ac3d`. `main` at `ee19a35`. **Not pushed this session — push it.** |
| Spec | `docs/superpowers/specs/2026-09-07-m14c-a-builder-design.md` |
| Plan | `docs/superpowers/plans/2026-09-07-m14c-a-builder.md` — **Tasks 1–12 done, plus work the plan never listed (below)** |
| Backend | **821 / 0 / 0 / 0**, `BUILD SUCCESS` — re-verified at the close, nothing backend changed this session |
| Karma | **874 SUCCESS** |
| Production build | clean, **zero warnings** |
| Visual regression | **33 passed** — baselines regenerated, see the warning below |
| Playwright e2e | **STILL not run this milestone.** Task 13. `programming.spec.ts` drives a screen that no longer exists. |
| Piece editor | signed off earlier: `audit` 19/20, `critique` 35/40 |
| Class stack | signed off now: **`audit` 20/20, `critique` 34/40**, browser-verified |

---

## What is actually left

**Task 13 — e2e.** The only substantial work remaining. See the two warnings below; this is not a
formality and it is not a re-run.

**Task 14 — close the records.** `docs/BACKLOG.md`, `docs/ROADMAP-AT-A-GLANCE.md` row 10,
`.superpowers/sdd/progress.md`, and rewrite this file.

---

## ⚠️ `e2e/tests/programming.spec.ts` tests a DELETED screen

It drives `instance-builder.page.ts` by its test ids — `piece-stack`, `add-piece`, `piece-title`,
`publish-btn`, and `.prog.pub` — and every one of them is gone. That file was deleted in `9d78d99`
and the route now loads `ClassBuilderPage`. **This spec must be REWRITTEN, not re-run**, against the
new ids: `stack-form`, `add-slot`, `add-slot-<MACRO>`, `slot-open-<i>`, `slot-write-new`,
`pick-row-<id>`, `slot-detail-select`, `piece-toggle-<i>`, `piece-edit-<i>`, `save-draft`,
`save-publish`, `copy-day`, `copy-confirm`.

The wiring Karma structurally cannot see, and which the rewrite must cover:
open a class → fill a slot from the library → **reload** → confirm it persisted; and write a NEW
piece → save in the editor → land back on the stack with the piece attached.

**The e2e baseline of 91 predates this milestone.** A shared `ui/` component, two forms, the wod
JSON model, `bh-pick-sheet` and `bh-button` have all changed since. Budget for fallout beyond this
one file.

## ⚠️ The visual baselines churn WHOLESALE when the gallery gains a section — this is not a bug

Adding `bh-banner` and the `sortable-list` section changed **52 baselines plus 6 new ones**, not the
two you would expect. Root-caused this session, with evidence:

- the suite screenshots each section after scrolling it into view, so the **document's total height
  sets the scroll offset, and the scroll offset sets the sub-pixel phase every glyph rasterises at**.
  Two more sections means a taller page, which re-rasterises text everywhere.
- It is real, not noise: a **main build reproduces main's baselines to ZERO differing pixels**, and
  this build differed by 4–8% on every section, identically every run.

Two traps that cost hours; do not pay them again:

1. **The per-section loop aborts at its first failing section.** A gallery with many differences
   reveals ONE per viewport per run, so the failures look like they are moving between icon, button
   and data-table. They are not moving. You are fixing one and uncovering the next.
2. **`--update-snapshots` writes the first stable capture; a verify run retries until it matches.**
   One regeneration pass can leave a set that still fails. **Run `./visual.sh --update-snapshots`
   TWICE, then verify.** That converges and stays green across rebuilds.

---

## Work this session the plan never listed

The plan's Task 11 was one screen. The user reviewed it live and ruled on a lot more.

- **`ClassDraftStore`** (`features/programming/class-draft.store.ts`) — the stack and the piece
  editor are SIBLING routes and could not exchange anything. The editor never loaded the piece at
  `:index`, always minted a second wod instead of patching, and the wod it created was never
  attached to the session. The store carries drafts across the navigation and holds the unsaved
  baseline, so a piece written in the editor is still guarded on return.
- **`bh-banner`** (`ui/banner.component.ts`) — a floating confirmation, good/danger, optional
  action, both tones auto-dismissing with the danger dwell longer and the dwell pausing on
  hover/focus. It **composes `bh-alert`** rather than restating it, so a semantic colour never fills
  anything larger than a chip. In the dev gallery with its seven states.
- **`--dock-h`** — the dock's outer height moved into `_tokens.scss` and the dock pins its own
  `min-height` to it. Anything anchored to the bottom of a mobile screen has to clear the dock, and
  the banner was re-deriving `56 + 6 + 6` in a second file.
- **`bh-button` gained `describedBy`** — an attribute on a component host does not reach the element
  inside it. Fifth instance of that trap in this codebase.
- **Copy a class to the day's other occurrences** — targets are same-name sessions on the same local
  day; the sheet lists them, ticks the empty ones and never treats a failed check as empty;
  publishing travels with the content. **No backend work**: `PUT /sessions/{id}/items` already
  copies via `fromLibraryWodId` and does not require a library row.

## What the user ruled — binding, do not relitigate

Carried forward, plus new:

1. **The fill-slot sheet's filters are BUTTONS opening steps INSIDE the same sheet**, styled like the
   piece editor's unit picker. A sheet stacked on a sheet stays banned.
2. **A search result opens a DETAIL step** with Back and Select; it does not fill the slot on tap.
   Each result row also carries a one-line prescription snippet.
3. **Reorder leaves no hover fill** — after a drop the pointer rests on the dropped row and a hover
   fill read as "this one is selected".
4. **"Save and publish" is VOLT**; the DRAFT/LIVE pill gave up volt so the screen keeps one.
   The builder is on the hero list, and publishing IS live/now.
5. **The two saves share a row; copy sits BELOW them.** Four stacked buttons was rejected.
6. **Remove is two-step**, mirroring the piece editor: danger-bordered ghost opens, filled executes.
7. **The banner replaces the inline "Saved" text.** Saving a draft and publishing read differently.

## THE BUILDER IS NOT THE RUNNER — a persona error that reached a scored pass

A critique brief this session described the coach as "on the gym floor, one-handed, mid-class". That
is the **runner** (`coach/classes/:id/run`). The **builder** is where a coach programs beforehand, on
tablet or desktop — `PRODUCT.md` says exactly that. The critique's only P1 was built on the wrong
scene and was withdrawn. Mobile-first at 360px still binds, because of Capacitor and the App Store;
that is a layout constraint, not a claim about when the screen is used.

## Open, filed, NOT fixed

- **Disabled buttons measure 2.18:1** (`--surface` on `--disabled`, `.btn.strong:disabled`). WCAG
  exempts inactive controls so it is not a violation, but the label is the weakest text on screen —
  confirmed by eye on the copy sheet. It lives in the shared `bh-button`, so it is a system-wide
  decision, deliberately not taken here.
- **`--faint` fails AA on `--surface-2`** (4.27:1) while passing on `--surface` (4.70:1). One place
  hit that combination and was fixed; **the pairing is a live trap for the next sheet-row design.**
- The fill-slot search step is the densest view in the flow (search + two filters + write-new + a
  result list). Recorded as P3 once the persona error was corrected.
- **A collapsed block's name field is 38px wide at 320px** in the PIECE EDITOR. Offered twice, never
  answered. The proposal: render the name as plain text while collapsed, editable only when expanded.
- **The hero title still clips** past ~16 characters at 360px in the piece editor.
- `WodJsonValidator` does not cross-check `blockIndex`, and weight unit does not convert on switch.
  Both deliberate, both carry `ponytail:` comments. **The TV must tolerate an index it cannot resolve.**
- Everything in spec §10: timer auto-arm → M34, admin entry point → M15b, library/benchmarks/types
  pages → M14c-b, roster team-splitting → Project 2.

## Dev-data note

The demo day held only ONE "Burn It", so the copy button correctly hid itself and the feature could
not be exercised. **A second Burn It at 21:00 was inserted into the dev database** to test it. It is
dev-only data, not a migration and not seed code.

## Process, as the user corrected it

The routine in `CLAUDE.md` reads `audit → critique → fix every P0/P1 → re-score BOTH`. The user
ruled the better order is **`audit → fix → critique`**, so the critique judges a screen that is not
about to change under it and only one scoring pass is spent. **Amend `CLAUDE.md` if that is to be
the rule.**

Also: a scored pass must be run with **Claude in Chrome**, not only Playwright and not only source.
Playwright measures real pixels and is the right tool for contrast, overflow, axe and keyboard, but
the user asks specifically whether the screens were SEEN. Look at them.

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and FINISH M14c-a: Task 13 (e2e) then Task 14 (records).

cd ~/dev/boxhub && git checkout m14c-a-builder && git status
# expect a CLEAN tree at de8ac3d

Do NOT re-plan, do NOT re-spec, do NOT reopen any screen. The piece editor AND
the class stack are both built, reviewed and signed off -- piece editor audit
19/20 critique 35/40, class stack audit 20/20 critique 34/40. Do not re-score
them, do not "improve" them unless I ask.

FIRST: confirm the baselines yourself. Never quote a number from this file.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # expect 821/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # expect 0 warnings
Expect 821/0/0/0, TOTAL: 874 SUCCESS, zero warnings. The "Mailer ... port:
localhost, 1025" ERROR lines are pre-existing SMTP noise -- judge only by
"Tests run:" and "BUILD SUCCESS".

  cd ~/dev/boxhub && docker compose -f docker/docker-compose.yml up -d --build
  # http://localhost/app/coach/classes/d3063f9c-1b8e-4627-80c8-30aa783190e4/build
  # as coach@demo.io / boxhub-demo-2026

TASK 13 IS A REWRITE, NOT A RE-RUN. e2e/tests/programming.spec.ts drives
instance-builder.page.ts, which was DELETED this milestone -- piece-stack,
add-piece, piece-title, publish-btn and .prog.pub no longer exist. Rewrite it
against the new ids (listed in the handoff) and cover the wiring Karma cannot
see: fill a slot from the library -> RELOAD -> it persisted; and write a new
piece -> save -> land back on the stack with it attached. The e2e baseline of 91
predates this milestone and a shared ui/ component, two forms, the wod JSON
model, bh-pick-sheet and bh-button have all changed. Budget for fallout beyond
that one file.

VISUAL BASELINES: if you touch the dev gallery, the WHOLE set churns and that is
correct, not a bug -- the handoff explains why. Two traps: the per-section loop
ABORTS at its first failure so you only see one per viewport per run, and
--update-snapshots must be run TWICE before it converges. Run e2e/visual.sh in
its Linux container, never Playwright locally.

ALWAYS SUBAGENT. One executor per task. The orchestrator dispatches, reviews
every diff, runs every gate ITSELF, and commits. NEVER accept an executor's
reported test numbers -- run the suite yourself and read the real line.

SUBAGENTS STALL ON THIS REPO. What survives is a SHORT brief naming ONE file
with the detail in a contract file on disk that the brief points at. Long inline
briefs stall, and one stalled this session waiting on a notification that never
came -- tell them to run everything in the FOREGROUND and never wait on a
monitor. Tell every executor to IGNORE the graphify PreToolUse hook. Tell them
to leave the docker stack UP.

MEASURE AT MORE THAN ONE WIDTH: 320 / 360 / 393 / 768 / 1024 / 1280.
A SCORED PASS NEEDS CLAUDE IN CHROME, not just Playwright and never just source
-- Playwright is right for contrast, overflow, axe and keyboard, but LOOK at the
screens too. I will ask whether you did.

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is no
./mvnw and no `timeout` binary; JAVA_HOME=/opt/homebrew/opt/openjdk@21. NEVER
chain a grep gate with && -- a grep that correctly finds nothing exits 1 and
aborts the chain. Compose from the repo root (docker/docker-compose.yml),
Playwright from e2e/. THE BACKEND IMAGE NEEDS `up -d --build` -- the jar is
baked in with no source mount.

A backtick inside a comment in an Angular `template:`/`styles:` literal closes
the string, and a backtick in a bash -m commit message runs command
substitution. Write commit messages through a quoted heredoc.

Two things I owe you an answer on, ask me:
- the piece editor's collapsed block name field, 38px wide at 320px;
- whether to amend CLAUDE.md's routine to audit -> fix -> critique, which is the
  order I ruled this session.
```
