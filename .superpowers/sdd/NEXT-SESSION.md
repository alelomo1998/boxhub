# Next session — **M14c-b in progress. The Library screen is DONE. Resume at Task 6.**

| | |
|---|---|
| Branch | **`m14c-b-library`**, local only — never pushed. Tree clean after the handoff commit. |
| Spec | `docs/superpowers/specs/2026-09-13-m14c-b-library-design.md` — D1–D12, then **§8 Revision 1: D13–D23** (wins over §1–§7). |
| Plan | `docs/superpowers/plans/2026-09-13-m14c-b-library.md` — Tasks 1–9, then R1–R7 and addenda R6b–R6e. |
| Backend | 848 / 0 / 0 / 0 (at `5baaa81`) |
| Karma | 975 SUCCESS |
| Build | zero warnings |
| Visual | 33 passed (week-calendar baselines re-taken for the gallery's `toneWords` instance) |
| e2e | **full suite NOT run on this branch yet** |
| Library audit | 16/20 — `docs/superpowers/reviews/2026-09-15-m14c-b-library-audit.md` |
| Library critique | **34/40 in Chrome, no P0/P1/P2** — `docs/superpowers/reviews/2026-09-15-m14c-b-library-critique.md` (passes 1→2→3: 27→33→34) |

## Where the work stands

**Library page: shape → build → sign-off → audit → fix → critique — complete.** The critique added,
all user-approved: full benchmark sheet (block labels, notes, score type, cap), D9 flag in the default
list, dimmed refresh, removable filter chips, 3-letter hint in the chip row, no-match "Clear search" /
"Clear filters" (clears search too), History day marks (`GET /api/box/wods/history/days`, calendar
`toneWords`), benchmark eyebrow `BENCHMARK · GIRL · FOR TIME`, lowercase units.

**Remaining, in this order:**
1. **Task 6** — Delete in the piece editor (standalone only). New surface → full per-screen routine
   (shape options if it's a new composition → build → user sign-off → audit → fix → critique).
2. **Task 7** — benchmarks in the class stack's slot picker + the pending-pick fix ("Edit this piece"
   on an unsaved library pick patches the library row). Picker still uses `libraryEntries()`/
   `mergeLibrary`. **Also, found in the critique:** class-builder's `.rxline` load span appends the
   REPS unit (`r.unit`) to the load — print the box weight unit like `prescriptionLines`; its detail
   step and expanded row now render block notes (added this session — look at them).
3. **Task 8** — routes/dock/admin nav: delete the Benchmarks page, `/coach/benchmarks`→`wods`,
   `/coach/types`→`classes`, Types → `/admin/types`; dock loses Bench and Types.
4. **R6d** — `[jump]="true"` on every other `bh-week-calendar` (book, classes, schedule, announcements);
   check each label reads identically. Note: unselectable days no longer announce a tone word (changed
   in `ui/week-calendar` this session) — the booking strip is affected, verify it.
5. **R7** — `e2e/tests/library.spec.ts` (supersedes Task 9; keep `sheet-swipe.spec.ts`). Cover the
   critique additions (chip removal, clear filters, history day mark), then a full `down -v` e2e run.
6. **Close:** BACKLOG entries — audit P3s (desktop top-nav 40px, h1→h3 skip, duplicate `nav[Coach]`,
   shell header `offsetHeight` per scroll, week-strip day 38px at 320); critique P3s (movement facet
   needs recall — no browse list; hint alone on its own line at phone width with chips; search
   placeholder truncates at 330; volt focus box on a filter step heading after a tap; movement step
   has no direct apply; no on-page result count; gym name collapses to "D" at 330); piece-editor's
   duplicated macro/preset label maps; slot picker onto `GET /library`. Month-grid History marks is
   already filed. Roadmap row 11 → done, rewrite this file, `graphify update .`, merge to `main`,
   delete the branch.

## Rules the user enforced THIS milestone (binding)

- **The per-screen gate is sacred:** build → *user visual sign-off* → audit → fix P0/P1 → critique.
  After a review round: **ONE batch of fixes → verify → click path → STOP.**
- **A score is only a score if it was measured in Chrome with impeccable's method THIS pass.** A
  rescore written from earlier observations was rejected: *"rescore using impeccable and claude in
  chrome, not by your like"*. Every pass: fresh tab, walk the states, attempt the detector (it is
  CSP-blocked — say so), write the table from what you saw.
- **Never `impeccable detect` on source.** Audit and critique run on the live page.
- **UI additions are the user's call** — list them as numbered options with the score each buys;
  the user picked "all 4". P3s were left to the orchestrator.
- **Signing in:** the user signs in to Chrome; the Claude tab shares the cookie. Never type a password.
- Hand over **click paths**, not screenshots.

## Traps hit this milestone (still bite)

- **A new Chrome tab from `tabs_create_mcp` rendered at 330px** when `resize_window` would not go
  below 550 — use it for phone-width passes; still take 320/360/393 raw measurements in Playwright.
- **Chrome coordinate clicks through sheets race the slide animation** — use `find` refs, one step and
  a 1s wait per action, or drive state with page JS and only screenshot.
- **`bh-search-bar` de-dupes on the last emitted value** — any consumer that resets `[value]` relied on
  the fix in `5baaa81`; don't reintroduce a `lastEmitted` check that ignores external sets.
- **Focus after a DOM-removing action: `afterNextRender`, not `setTimeout`** — the timeout ran before
  the chip left the DOM and focus fell to `<body>`.
- **An executor brief that asserts data ("no benchmark has a time cap") is a guess** — Cindy has
  one; the executor caught it. Grep the seed before writing a data claim.
- **A mouse drag is not a touch swipe** (CDP `Input.dispatchTouchEvent`, see `sheet-swipe.spec.ts`).
- **Karma asserting a class ≠ the layout working**; the visual baseline catches it.
- **`DevDataSeeder` is invisible to the suite** (`@Profile("dev")`) — boot a `down -v` stack after
  seeder-reachable changes.
- `-Dtest=A,B` (comma). Hibernate `Expression.as()` emits no SQL cast — `JpaExpression.cast()`.
  Never chain a commit after a test run with `;`. A stdin-reading shell command hangs.
- Everything older still applies: `env -u NODE_OPTIONS`; no `./mvnw`/`timeout`; backend image needs
  `up -d --build`; `down -v` before full e2e; `e2e/visual.sh --update-snapshots` twice after a gallery
  change; no backticks in Angular template comments; subagents: short brief pointing at a contract
  file, Sonnet, never commit; stage explicit paths.

## Stack state

Dev stack up with the current build and **55 "Smoke piece N" library rows** (a `down -v` clears them).
One Claude Chrome tab open on `/app/coach/wods`.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and resume M14c-b on branch m14c-b-library.

cd ~/dev/boxhub && git checkout m14c-b-library && git status
# expect a CLEAN tree at the handoff commit (or later). The branch is local only.

FIRST: confirm the baselines yourself. Never quote a number from the handoff.
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build
Expect 848/0/0/0, TOTAL: 975 SUCCESS, zero warnings.

THEN start Task 6 (Delete in the piece editor, standalone only) from the plan. It is a new surface:
shape first — if the composition is new, bring me 3-4 real options and STOP for my pick.

Per screen: shape -> build -> my visual sign-off -> audit (>=16/20) -> fix P0/P1 -> critique
(>=32/40). Audit and critique run with impeccable IN CLAUDE IN CHROME on the live page, every pass —
never from memory, never impeccable detect on source. I am signed in to Chrome.
After I review: ONE batch of fixes, verify, hand me the click path, STOP.

ALWAYS SUBAGENT (Sonnet) for plan tasks; short brief pointing at the plan; never commit from a
subagent. The orchestrator reviews every diff and runs every gate itself.
Gesture changes get a real touch test, not a mouse drag.
```
