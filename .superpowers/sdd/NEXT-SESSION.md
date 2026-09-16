# Next session — **M14c-b: Tasks 1–8 DONE. Resume at R6d.**

| | |
|---|---|
| Branch | **`m14c-b-library`**, local only — never pushed. Tree clean at `f7d4454`. |
| Spec | `docs/superpowers/specs/2026-09-13-m14c-b-library-design.md` — D1–D12, then **§8 Revision 1: D13–D23** (wins over §1–§7). |
| Plan | `docs/superpowers/plans/2026-09-13-m14c-b-library.md` — Tasks 1–9, then R1–R7 and addenda R6b–R6e. |
| Backend | **851 / 0 / 0 / 0** (verified at `2b9753c`; Task 8 was frontend-only, backend untouched since) |
| Karma | **999 SUCCESS** (verified at `f7d4454`) |
| Build | zero warnings |
| Visual | **NOT re-run this session.** 33 baselines stand from `76d2615`. `pick-sheet` has no baseline at all. |
| e2e | **full suite still NOT run on this branch** |
| Task 7 | audit 18/20 · critique 33/40 — `docs/superpowers/reviews/2026-09-16-m14c-b-slot-picker-*.md` |

## Where the work stands

**Task 7 — benchmarks in the class stack slot picker (`2b9753c`), Task 8 — routes/dock/admin nav (`f7d4454`).**

Task 7's shape was user-picked from four options: **Library parity** — a benchmark row carries the same
bordered chip `bh-piece-card` uses, then kind + timing. This **overrode the plan's `entryMeta`**, which
printed a flat "Benchmark · Girl" and dropped the timing. `PickRow` gained an optional `chip`.

**Three of Task 7's four fixes landed in the BACKEND**, because the defects were in what the API served,
not what the screen drew. Worth understanding before touching this area again:

1. `.rxline` appended the **REPS** unit to the **LOAD**, printing `95 REPS`. The naive fix prints
   `95 kg` — plausible and *wrong*, because `GET /benchmarks` served loads raw in lb while `/library`
   converted them. `BenchmarkController.toDto` now converts, so every caller gets the box's unit.
   Fran reads `43 kg`, agreeing with its own block note `Rx 95/65 lb · 43/29 kg`.
2. `/benchmarks` carried **no `timingPreset` field at all**, so one benchmark read "Girl · For time" on
   the Library page and "Girl · Workout" in the picker. It now serves `WodService.derivedTimingPreset`,
   the same method `/library` uses.
3. `editPiece` on an unsaved pick patched the **library row itself**, and would have 404'd on a
   benchmark. It saves first. That save is a write the coach never asked for, so the button reads
   **"Save and edit"** while a pick is pending — label and handler share one predicate,
   `hasPendingSource`.

Task 8 per the user's 2026-09-16 ruling: **Types MOVED to `/admin/types`, not rebuilt.** `types.page.ts`
was not touched. Its rebuild belongs to the admin milestones.

## Remaining, in this order

1. **R6d** — `[jump]="true"` on the four remaining `bh-week-calendar` consumers. **I verified the list
   this session; it has NOT grown:** `athlete/book.page.ts`, `coach/classes.page.ts`,
   `admin/schedule.page.ts`, `messaging/announcements.page.ts`. (`wod-library.page.ts` and the dev
   gallery already carry `[jump]`.) Enable only — no other change to screens outside this milestone.
   Check each at 360 and 1280 that the month label reads **identically** to before (R6d's first review
   found the jump button overriding the label's type once), and note that unselectable days no longer
   announce a tone word, which affects the **booking strip** — verify it.
2. **R7** — `e2e/tests/library.spec.ts` (supersedes Task 9; keep `sheet-swipe.spec.ts`). Full scope in
   the plan at line 1605. Cover additionally:
   - the Library critique additions: chip removal, clear filters, history day mark
   - **Task 6:** trash → sheet → Keep it; delete → "<name> deleted." notice; Back skips the piece;
     no trash on `/coach/wods/new`
   - **Task 7:** a benchmark row shows the chip; picking one sends `fromBenchmarkId`; the detail step
     prints the load in the box's unit
   - **Task 8:** both redirects; admin reaches `/admin/types`
   Then a full `down -v` e2e run — which also clears the stack residue below.
3. **Close:**
   - **BACKLOG, audit P3s:** desktop top-nav 40px; h1→h3 skip; duplicate `nav[Coach]`; shell header
     `offsetHeight` per scroll; week-strip day 38px at 320.
   - **BACKLOG, Library critique P3s:** movement facet needs recall; hint alone on its line at phone
     width; search placeholder truncates at 330; volt focus box on a filter step heading; movement step
     has no direct apply; no on-page result count; gym name collapses to "D" at 330.
   - **BACKLOG, Task 6 P3s:** 409 has no next step; delete notice has no dismiss and survives
     search/filter; desktop dialog has both X and Keep it with full-width stacked buttons; tab title
     "Edit WOD · rxed" on a piece screen; in Chromium, Tab from a sheet's last control reached the shell
     box switcher (all sheets, cause unverified).
   - **BACKLOG, Tasks 7–8 — ALL SIX ALREADY FILED to `docs/BACKLOG.md` this session**, nothing to do:
     the `Benchmark` chip's CSS in four files; per-page `weightUnit` fetch; the picker's false-empty
     state; the picker/Library eyebrow case split; no benchmarks-only facet; `/admin/types`'s `h1`.
   - **BACKLOG, other:** piece-editor's duplicated macro/preset label maps; slot picker onto
     `GET /library`. Month-grid History marks is already filed.
   - Then: roadmap row 11 → done, rewrite this file, `graphify update .`, merge to `main`, delete the branch.

## Rules the user enforced THIS milestone (binding)

- **The per-screen gate is sacred:** shape (options if new) → build → *user visual sign-off* → audit
  → fix P0/P1 → critique → the user picks fixes → **ONE batch → verify → click path → STOP.**
  A task that only deletes a screen or moves a route (Task 8) needs no shape/audit/critique.
- **A score is only a score if it was measured in Chrome with impeccable's method THIS pass.** Every
  pass needs a fresh tab, a walk of the states, and an attempt at the detector (it is CSP-blocked,
  `script-src 'self'`; say so). Critiques run **inline with the DEGRADED banner** — this overrides the
  impeccable skill's dual-sub-agent mandate.
- **Never `impeccable detect` on source.**
- **UI additions and copy fixes are the user's call.** Present them as a numbered table with the points
  each buys. The user has picked "all 4" twice, and "just the cheap one" once.
- **"do as you want" means decide and justify** — file the expensive fix with the real cost, do the
  cheap one. The user does not want a menu when they have said that.
- **Verify a route redirect end-to-end, not by asserting route config.** Karma asserting
  `route.redirectTo === 'wods'` cannot catch a `pathMatch` problem; a throwaway Playwright spec can.
- **Signing in:** the user signs in to Chrome and the Claude tab shares the cookie. Never type a
  password. Playwright may log in as `coach@demo.io` / `admin@demo.io`, password `boxhub-demo-2026`.
  A Chrome session signed in as COACH bounces off `/admin/**` — that is the guard, not a bug.
- Hand over **click paths**, not screenshots. Caveman-terse chat.

## Traps hit this milestone (still bite)

- **The dev stack is `http://localhost`, not https** (nginx on :80).
- **Chrome's synthetic keys don't reach the page** and **Chrome cannot size a window below ~500px.**
  Take keyboard, focus and narrow-viewport measurements in a **temporary Playwright spec** under
  `e2e/tests/` against the live stack, then delete it. This worked well twice this session.
- **A measurement can be a false positive.** `bh-search-bar`'s input reports no focus ring because the
  ring is deliberately on `.sb:focus-within` and the inner `.in` suppresses its own. Check the CSS
  before filing a focus finding.
- **`mergeLibrary` dedupes by `benchmarkTemplateId`** ("never two Frans"), which is why the picker's
  `find(x => x.wod.id === id)` is safe. Don't "fix" it.
- **A copied benchmark and a global one behave differently:** a copy arrives through `wods()` with a
  real `timingPreset`; a global goes through `benchmarkAsWod()`. Asymmetries between two look-alike
  rows usually mean one came from each path.
- **Navigating away from a dirty class builder raises a native "Leave site?" dialog** that blocks the
  Chrome extension. Open a fresh tab instead of forcing it.
- **Removing a piece in the builder removes the whole SLOT**, and the builder refuses to save a class
  with zero pieces — so a class saved during a review cannot be emptied from the UI.
- **`bh-sheet` is a native `<dialog>`:** Escape or the backdrop closes it natively and then emits
  `closed`. A `(closed)` handler that ignores the event while pending desyncs the open signal.
- **`bh-button [loading]` renders native `disabled`**, so focus drops to `<body>`. Restore with
  `afterNextRender` (see `reset.page.ts`, `piece-editor.page.ts` `confirmDelete`).
- **The visual gallery test is a hard assertion per viewport:** the first failing section hides every
  later one. After `--update-snapshots` ×2, check `git status` shows only the sections you expected.
- **The benchmark-copy test data is nearly gone:** only **Angie** (`db783a59…`) still has
  `benchmarkTemplateId` among the originals. Force errors instead of deleting.
- **Chrome coordinate clicks through sheets race the slide animation.** Use `find` refs, one step and a
  1s wait per action, or drive state with page JS. A stale `ref_` after a re-render silently no-ops.
- **`bh-search-bar` de-dupes on the last emitted value.** Don't reintroduce a `lastEmitted` check that
  ignores external sets (fixed in `5baaa81`).
- **An executor brief that asserts data is a guess.** Grep the seed/API before writing a data claim.
- **A mouse drag is not a touch swipe** (CDP `Input.dispatchTouchEvent`, see `sheet-swipe.spec.ts`).
- **`DevDataSeeder` is invisible to the suite** (`@Profile("dev")`). Boot a `down -v` stack after
  seeder-reachable changes.
- **Still true from earlier:** `-Dtest=A,B` (comma). Hibernate `Expression.as()` emits no SQL cast; use
  `JpaExpression.cast()`. Never chain a commit after a test run with `;`. A stdin-reading shell command
  hangs. `env -u NODE_OPTIONS`. No `./mvnw`/`timeout`. Rebuild images with
  `cd docker && docker compose up -d --build frontend|backend`. `down -v` before a full e2e run.
  `e2e/visual.sh --update-snapshots` twice after a gallery change. No backticks in Angular template
  comments. Subagents: short brief pointing at a contract file, Sonnet, never commit, stage explicit
  paths. A zsh glob in `--include=*.ts` fails unquoted.

## Stack state

Both images are rebuilt and healthy at `f7d4454`. **Residue the user has declared unimportant:** draft
class **BURN IT** (`2d46610e-61cd-4a38-9480-417bca98c447`) holds one Fran piece saved during the Task 7
audit; it previously had a three-slot skeleton and no saved items. The `down -v` that R7 requires clears
it. ~52 "Smoke piece N" library rows also remain and go with the same `down -v`.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and resume M14c-b on branch m14c-b-library.

cd ~/dev/boxhub && git checkout m14c-b-library && git status
# expect a CLEAN tree at f7d4454 (or later). The branch is local only.

FIRST: confirm the baselines yourself. Never quote a number from the handoff.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build
Expect 851/0/0/0, TOTAL: 999 SUCCESS, zero warnings.

THEN R6d: [jump]="true" on the four remaining bh-week-calendar consumers (book, classes, schedule,
announcements). Enable ONLY — no other change to those screens. Check each at 360 and 1280 that the
month label reads identically to before, and verify the booking strip, where unselectable days no
longer announce a tone word. Then R7 (e2e/tests/library.spec.ts) on a `down -v` stack.

R6d touches four screens that are NOT this milestone's surface, so it gets no shape/audit/critique —
it is an enable-and-verify task. R7 is tests only. If something there turns into a real design
change, STOP and bring it to me first.

Keyboard/focus and anything below ~500px go through a throwaway Playwright spec against the live
stack (Chrome keys don't reach the page and it can't size that small); delete the spec after. I am
signed in to Chrome as a coach — /admin/** correctly bounces that session.

ALWAYS SUBAGENT (Sonnet) for plan tasks; short brief pointing at the plan; never commit from a
subagent. The orchestrator reviews every diff and runs every gate itself.
Verify redirects and navigation end-to-end, never by asserting route config.
```
