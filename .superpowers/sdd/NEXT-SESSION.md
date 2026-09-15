# Next session — **M14c-b in progress. Library and Task 6 (Delete) are DONE. Resume at Task 7.**

| | |
|---|---|
| Branch | **`m14c-b-library`**, local only — never pushed. Tree clean after the handoff commit. |
| Spec | `docs/superpowers/specs/2026-09-13-m14c-b-library-design.md` — D1–D12, then **§8 Revision 1: D13–D23** (wins over §1–§7). |
| Plan | `docs/superpowers/plans/2026-09-13-m14c-b-library.md` — Tasks 1–9, then R1–R7 and addenda R6b–R6e. |
| Backend | 848 / 0 / 0 / 0 (session start, `00b5d5e`; backend untouched since) |
| Karma | 988 SUCCESS (at `810143b`) |
| Build | zero warnings |
| Visual | 33 passed (icon gallery baselines re-taken for `trash-2`) |
| e2e | **full suite NOT run on this branch yet** |
| Library | audit 16/20 · critique 34/40 — `docs/superpowers/reviews/2026-09-15-m14c-b-library-*.md` |
| Task 6 Delete | audit 18/20 · critique 31 → **34/40**, no P0/P1/P2 — `docs/superpowers/reviews/2026-09-15-m14c-b-piece-delete-*.md` |

## Where the work stands

**Task 6 — Delete in the piece editor: complete** (`c642205`, `76d2615`, `810143b`). User-picked
shape **C**, which overrides the plan's footer button: a red-outline trash icon on the title row,
standalone `/coach/wods/:id` only. It opens a sheet titled **"Delete <name>?"** with the classes copy,
a benchmark reassurance line when `benchmarkTemplateId` is set, **Keep it**, and a filled **Delete**.
- 409 and other errors show inline.
- Escape mid-request reopens the sheet with the error; focus returns to Delete after a failure.
- Success navigates with `replaceUrl`, so Back skips the dead piece. The library shows
  **"<name> deleted."** (`bh-alert tone="good"`, read from `getCurrentNavigation()` state, not
  `history.state`).
- The flow says **piece**, never WOD.
- `trash-2` was added to `bh-icon`.

**Remaining, in this order:**
1. **Task 7** — benchmarks in the class stack's slot picker, plus the pending-pick fix: "Edit this
   piece" on an unsaved library pick currently patches the library row itself. The picker still uses
   `libraryEntries()`/`mergeLibrary`. **Also found in the Library critique:** class-builder's `.rxline`
   load span appends the REPS unit (`r.unit`) to the load. Print the box weight unit instead, like
   `prescriptionLines` does. Its detail step and expanded row now render block notes; look at them.
   Shape first. If the composition is new, bring 3–4 options (AskUserQuestion with previews worked)
   and STOP.
2. **Task 8** — routes, dock and admin nav:
   - Delete the Benchmarks page.
   - Redirects: `/coach/benchmarks` → `wods`, `/coach/types` → `classes`.
   - Types moves to `/admin/types`.
   - The dock loses Bench and Types.
3. **R6d** — `[jump]="true"` on every other `bh-week-calendar` (book, classes, schedule,
   announcements); check each label reads identically. Unselectable days no longer announce a tone
   word, which affects the booking strip; verify it.
4. **R7** — `e2e/tests/library.spec.ts` (supersedes Task 9; keep `sheet-swipe.spec.ts`). Cover:
   - the Library critique additions: chip removal, clear filters, history day mark
   - **Task 6:** trash → sheet → Keep it; delete → "<name> deleted." notice; Back skips the piece;
     no trash on `/coach/wods/new`
   Then a full `down -v` e2e run.
5. **Close:**
   - **BACKLOG, audit P3s:** desktop top-nav 40px; h1→h3 skip; duplicate `nav[Coach]`; shell header
     `offsetHeight` per scroll; week-strip day 38px at 320.
   - **BACKLOG, Library critique P3s:**
     - movement facet needs recall (no browse list)
     - hint sits alone on its own line at phone width with chips
     - search placeholder truncates at 330
     - volt focus box on a filter step heading after a tap
     - movement step has no direct apply
     - no on-page result count
     - gym name collapses to "D" at 330
   - **BACKLOG, Task 6 P3s:**
     - 409 has no next step
     - the delete notice has no dismiss and survives search/filter
     - the desktop dialog has both X and Keep it, with full-width stacked buttons
     - browser tab title "Edit WOD · rxed" on a piece screen
     - in Chromium, Tab from a sheet's last control reached the shell box switcher (all sheets, cause
       unverified)
   - **BACKLOG, other:** piece-editor's duplicated macro/preset label maps; slot picker onto
     `GET /library`. Month-grid History marks is already filed.
   - Then: roadmap row 11 → done, rewrite this file, `graphify update .`, merge to `main`, delete the
     branch.

## Rules the user enforced THIS milestone (binding)

- **The per-screen gate is sacred:** shape (options if new) → build → *user visual sign-off* → audit
  → fix P0/P1 → critique → the user picks fixes → **ONE batch → verify → click path → STOP.**
- **A score is only a score if it was measured in Chrome with impeccable's method THIS pass.** Every
  pass needs a fresh tab, a walk of the states, and an attempt at the detector (it is CSP-blocked
  `script-src 'self'`; say so). Write the table from what you saw. Critiques run inline with the
  DEGRADED banner.
- **Never `impeccable detect` on source.**
- **UI additions and copy fixes are the user's call.** Present them as a numbered table with the
  points each buys. The user picked "all 4" twice.
- **The user reviews on the live stack and really deletes things** (Annie and two Smoke pieces this
  session). Before calling a missing row a bug, grep nginx:
  `docker logs docker-frontend-1 2>&1 | grep '"DELETE '` (an iPhone UA means the user's device mode).
- **Signing in:** the user signs in to Chrome and the Claude tab shares the cookie. Never type a
  password. Playwright may log in as `coach@demo.io` / `boxhub-demo-2026`.
- Hand over **click paths**, not screenshots. Caveman-terse chat.

## Traps hit this milestone (still bite)

- **The dev stack is `http://localhost`, not https** (nginx on :80).
- **Chrome's synthetic keys don't reach the page**: Tab left focus on the title. Take keyboard/focus
  measurements in Playwright against the live stack (a temporary spec under `e2e/tests/`, delete it
  after). Chrome `resize_window` also does nothing, and the tab stays at 330px. Take 1024 screenshots
  in Playwright.
- **Forcing an error in Chrome without deleting data:** patch `XMLHttpRequest.prototype.open` to send
  DELETE to `/api/box/__audit_forced_error__`, then confirm in nginx that only that 404 fired. In
  Playwright, use `page.route` with `fulfill`.
- **`bh-sheet` is a native `<dialog>`:** Escape or the backdrop closes it natively and then emits
  `closed`. A `(closed)` handler that ignores the event while pending desyncs the open signal and the
  sheet can never reopen. Sync on `closed`; guard only the explicit button.
- **`bh-button [loading]` renders native `disabled`**, so focus drops to `<body>`. Restore focus with
  `afterNextRender` (see `reset.page.ts`, `piece-editor.page.ts` `confirmDelete`).
- **The visual gallery test is a hard assertion per viewport:** the first failing section hides every
  later one. After `--update-snapshots` ×2, check `git status` shows only the sections you expected.
- **The benchmark-copy test data is nearly gone:** only **Angie** (`db783a59…`) still has
  `benchmarkTemplateId`. Don't delete it; force errors instead. Smoke pieces 5, 53 and 54 are gone.
- **Chrome coordinate clicks through sheets race the slide animation.** Use `find` refs, one step and
  a 1s wait per action, or drive state with page JS.
- **`bh-search-bar` de-dupes on the last emitted value.** Don't reintroduce a `lastEmitted` check
  that ignores external sets (fixed in `5baaa81`).
- **Focus after a DOM-removing action uses `afterNextRender`, not `setTimeout`.**
- **An executor brief that asserts data is a guess.** Grep the seed/API before writing a data claim.
- **A mouse drag is not a touch swipe** (CDP `Input.dispatchTouchEvent`, see `sheet-swipe.spec.ts`).
- **`DevDataSeeder` is invisible to the suite** (`@Profile("dev")`). Boot a `down -v` stack after
  seeder-reachable changes.
- **Still true from earlier:**
  - `-Dtest=A,B` (comma).
  - Hibernate `Expression.as()` emits no SQL cast; use `JpaExpression.cast()`.
  - Never chain a commit after a test run with `;`.
  - A stdin-reading shell command hangs.
  - `env -u NODE_OPTIONS`.
  - No `./mvnw`/`timeout`.
  - Rebuild images with `cd docker && docker compose up -d --build frontend|backend`.
  - `down -v` before a full e2e run.
  - `e2e/visual.sh --update-snapshots` twice after a gallery change.
  - No backticks in Angular template comments.
  - Subagents: short brief pointing at a contract file, Sonnet, never commit. Stage explicit paths.
  - A zsh glob in `--include=*.ts` fails unquoted.

## Stack state

The dev stack is up with the current frontend build (`810143b` code). 52 "Smoke piece N" library rows
remain; a `down -v` clears them and restores Annie. There are no Claude Chrome tabs to reuse; open a
fresh one.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and resume M14c-b on branch m14c-b-library.

cd ~/dev/boxhub && git checkout m14c-b-library && git status
# expect a CLEAN tree at the handoff commit (or later). The branch is local only.

FIRST: confirm the baselines yourself. Never quote a number from the handoff.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build
Expect 848/0/0/0, TOTAL: 988 SUCCESS, zero warnings.

THEN start Task 7 (benchmarks in the class stack slot picker + the pending-pick fix + the .rxline
load-unit bug) from the plan. Shape first — if the composition is new, bring me 3-4 real options
with previews and STOP for my pick.

Per screen: shape -> build -> my visual sign-off -> audit (>=16/20) -> fix P0/P1 -> critique
(>=32/40). Audit and critique run with impeccable IN CLAUDE IN CHROME on the live page, every pass —
never from memory, never impeccable detect on source. Keyboard/focus measurements go through
Playwright (Chrome keys don't reach the page). I am signed in to Chrome.
After I review: ONE batch of fixes, verify, hand me the click path, STOP.

ALWAYS SUBAGENT (Sonnet) for plan tasks; short brief pointing at the plan; never commit from a
subagent. The orchestrator reviews every diff and runs every gate itself.
Gesture changes get a real touch test, not a mouse drag.
```
