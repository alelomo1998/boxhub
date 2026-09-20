# Next session — **M17a, mid-milestone: the class workout screen is BUILT and unscored; class detail took four user-ruled corrections**

| | |
|---|---|
| Branch | **`m17a-athlete-daily`** — 38+ commits ahead of `main`, NOT merged |
| Spec | `docs/superpowers/specs/2026-09-17-m17a-athlete-daily-design.md` (**living** — §5.1, §5.2, §5.3 and §5.5 carry their shape decisions; §5.3 and §5.5 were both amended 2026-09-20) |
| Plan | `docs/superpowers/plans/2026-09-17-m17a-athlete-daily.md` (**1–12c done**; **12d, 13–17 open**) |
| Ledger | `.superpowers/sdd/2026-09-17-m17a-athlete-daily/progress.md` |
| Sketches | `docs/superpowers/sketches/m17a-README.md` — rounds 1–12, each with its render and what was decided |
| Backend | **869 / 0 / 0 / 0** — surefire aggregate at `117dbc8`, the last commit touching `backend/`; no backend source has changed since. A full re-run was in flight when this was written, so **re-run it rather than trusting this line**. |
| Karma | **1137 SUCCESS** |
| Build | **0 warnings** |
| e2e | `runner.spec.ts:43` still fails — proven pre-existing, filed. Full suite NOT run on a `down -v` stack; still owed (Task 16). |
| Visual | `class-card` STILL has no baselines — `e2e/visual.sh` owed. |

**Never quote these numbers — re-run them first.** The last handoff said Karma was 1113; it was
1111, and the two failures were real (see below).

---

## Done this session

**Task 12c — the class workout screen is built** (`/athlete/class/:id/workout`), matching the locked
`m17a-class-workout-r2.html`: B2 sub-block chips with no indent, N2 notes under their lines, `↳`
scaled lines indented under the movement column, `8 cal` in the reps column, the box's weight unit
in the load column, `bodyText` as preformatted mono, and no volt. `expandedRows()` gained its
`scales` passthrough at both levels; its `note` push did not move. `backTo` now resolves `:params`,
so a nested detail screen returns to its parent — extended once in `ShellChromeService`, and every
later nested detail screen inherits it.

### Five user rulings, all already applied

1. **A nested detail screen slides.** Opening the workout pushes in from the right, closing pops
   back out. Built on the View Transitions 12b installed: the route carries `slide`,
   `app.config.ts` tags `<html data-vt="fwd|back">` for exactly those navigations, `styles.scss`
   drives keyframes off that. The rule sweeps `*` — every captured group, not just root — because
   the screen being LEFT still carries class detail's photo/title `view-transition-name`s while the
   one being entered does not; left to the UA's default those two sit still and fade while the page
   slides out from under them.
2. **The shell header does NOT travel.** The mail/bell/avatar are the same controls on both screens,
   so sliding them made the chrome read as part of the page. The header is named and opted into a
   `bh-pinned` view-transition-class that the slide rules exclude; it holds position and cross-fades.
   **The detail title needed opting in separately** — its per-session name lifts it OUT of the
   header's snapshot, so it would otherwise be the one piece of chrome still flying off.
3. **The workout entry point is the PEEK CARD, not a chevron row.** The first build shipped a bare
   "Workout ›" and it was rejected on sight: a settings-drawer idiom that told the athlete nothing.
   Round 10 had *already drawn* the row naming its pieces; §5.5 recorded only the prose half and the
   build implemented the prose. Re-shaped as round 12, four options rendered and measured, **C
   chosen**. It costs one `sessionItems` request, fired only when the class is PUBLISHED.
4. **Booking outcomes live in the banner and NOWHERE else.** A failed action printed the reason
   under the button as well. Deleted — markup, CSS, the `errorMsg` signal and all four assignments.
   It was also an a11y defect: `bh-alert` already derives `role="alert"` from a danger tone, so the
   screen had TWO `role="alert"` elements announcing the same failure.
5. **The roster opens a PHOTO SHEET, not the athlete profile** — and **the sheet is where athlete
   detail grows**, not a screen (see "What M17c inherits").

### The dev seeder now provides real-flow programming, every boot

Two defects, both fixed. It fired **once ever** — the whole seeder sat behind "the demo box already
exists", which is not the same fact as "today's classes carry programming", so any stack older than
a day had none and the workout screen was unreachable. And its blocks were **hand-concatenated JSON
strings** written straight to `setBlocksJson`, bypassing `WodJsonValidator`. They are now typed
`WodJson` records pushed through the same validate + serialise a real `POST /api/box/wods` uses,
every movement line binds to a real `movementId`, and `SeededProgrammingIsRecreatableTest` asserts
the conversion is **byte-identical** to the strings it replaced. New fixtures cover what nothing
seeded before: a Chipper with two-level sub-blocks, a block note and a bound scale; a scale on the
burner. **Idempotence was verified on the running stack, not claimed** — second boot, counts
unchanged, one row per library piece.

---

## Owed before the milestone closes — start here

**Task 12d — the class workout gate. NOTHING HAS BEEN SCORED YET.** User visual sign-off is done
(they approved the screen and the sheet); `audit` (≥16/20) has NOT run, no P0/P1 pass has run, and
`critique` (≥32/40) has NOT run. Both need Claude in Chrome connected — if the browser is
unavailable, **stop and ask, do not score anyway**.

Then **Task 13** (class detail gate — it changed a lot today, so score what is there now, not what
was there yesterday), **14–15** (Home shape + build + gate), **16** (e2e wiring), **17** (close-out).

**Task 14 carries a trap already paid for once:** Home's one-tap Book must call its reload
**silently** from the start. The same defect on Book — `act()` calling a non-silent `load()`, which
flipped `loading` and unmounted every card — read to the user as "the page refreshes".

---

## What M17c inherits (filed in `docs/BACKLOG.md`)

- **`athlete/profile/:membershipId` is unfit and M17c rebuilds it**: no i18n marks at all,
  `ChangeDetectionStrategy.Eager`, an in-body `<h1>` and its own `‹ Back` button instead of the
  settled detail header. **It needs a brainstorm before it is built** — it has never been shaped,
  only inherited from M5.
- **Do NOT delete M17a's photo sheet and do NOT re-point the roster at the profile screen**
  (user-ruled after seeing it). The sheet is the athlete **peek** surface and anything a roster tap
  should reveal grows there. M17c must first answer: *what does a whole screen do that the sheet
  cannot?*
- **The coach row stays non-interactive until M26**, which owns the athlete-facing coach view, the
  profile with strong/weak points and price, and the request → coach-accepts flow; messaging a coach
  is M29a's. **No mock was built on purpose**: the v1.0 doctrine is *built but idle, never absent*,
  and a stub a pilot gym owner can reach is absent pretending to be present. Both milestones land
  before the pilot — this was checked against the roadmap, not assumed.
- **`wod.body_text` is to be RETIRED, not integrated** (user-ruled). Read in five places, written in
  none. Migrate the existing rows FIRST and keep the five readers until that is done, or an athlete
  loses the ability to read a class written before M14a.

---

## Traps hit this session (beyond the standing list)

- **A backtick inside a `styles:` or `template:` comment closes the template literal**, and the
  compiler error points somewhere else entirely ("Failed to resolve styles at position 1 to a
  string"). Hit while writing a comment containing a CSS property name in backticks. There is a
  memory about this and it still caught me — never write a token name in backticks inside those
  comments.
- **The handoff's own numbers were wrong.** Karma was 1111/2 FAILED, not 1113. Both failures were
  in `week-calendar.component.spec.ts` and **date-dependent**: the strip renders Monday-first around
  today, so when today is Sunday every sibling day is in the past and unselectable, and an
  unselectable day deliberately announces no tone word. It failed one day in seven. Fixed to open
  the past instead of depending on the weekday.
- **Measure a view transition with an in-page rAF sampler, not `page.evaluate` round-trips** —
  a 280ms animation is gone before twelve round-trips finish. `document.getAnimations()` reaches
  pseudo-element animations, which is the only way to observe `::view-transition-*` at all.
- **Let a transition settle before screenshotting**, or the shot double-images two screens.
- **A sketch can be RIGHT and still lose**: round 10 drew the entry row correctly and the build
  still shipped the wrong thing, because the spec captured the prose and not the render. When a
  shape is decided, the spec must point at the file **and the column**.

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M17a.

cd ~/dev/boxhub && git checkout m17a-athlete-daily && git status
# expect a CLEAN tree, 38+ commits ahead of main, NOT merged.

FIRST, confirm the baselines yourself — the last handoff's Karma number was WRONG and the two
failures it hid were real:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build

The dev stack serves BUILT images — rebuild the frontend (and the backend when the wire changed)
before looking at anything. The seeder now tops up today's programming on every boot, so "Burn It"
and "WOD Class" are PUBLISHED with real pieces; `down -v` still wipes hand-seeded past classes.

THEN, in this order:
1. Task 12d — the class workout gate. The screen is BUILT and the user has signed off on how it
   looks, but NOTHING has been scored. Run `audit` (≥16/20), fix every P0/P1, THEN `critique`
   (≥32/40) — audit first, fix between, one scoring pass. Both need Claude in Chrome connected; if
   the browser is unavailable, STOP AND ASK rather than scoring a source-only pass.
   Click path: Book → WOD Class (today 18:00) → the Workout peek card → back.
2. Task 13 — the class detail gate. It changed FOUR times today (peek card, banner-only errors,
   roster photo sheet, pinned header) — score what is on the screen now.
3. Tasks 14–15 — Home shape (RENDER the options, never describe them) + build + gate. Home's
   one-tap Book must reload SILENTLY from the start, or the "page refreshes" defect the user
   reported on Book comes straight back on a different screen.
4. Tasks 16–17 — e2e wiring on a `down -v` stack, `e2e/visual.sh` for the still-missing class-card
   baselines, then close-out.

Process, unchanged: ALWAYS a Sonnet subagent per plan task with a short brief pointing at the plan;
executors never commit; the orchestrator reviews every diff and runs every gate itself. Brief every
executor to delete its throwaway specs BY EXACT PATH, never a glob.

A new screen's shape is RENDERED as options in the browser, never described — serve the sketch,
open it in the user's own Chrome tab, send the Playwright PNG, and when a shape is chosen write the
decision into the spec pointing at the FILE AND THE COLUMN. A spec that records only the prose is
how the workout entry row shipped wrong this session even though round 10 had drawn it correctly.

VERIFY LAYOUT AND MOTION CLAIMS WITH MEASURED GEOMETRY. Measure motion with Playwright, never
Claude-in-Chrome (it throttles background tabs), using an in-page requestAnimationFrame sampler —
page.evaluate round-trips are too slow to catch a 280ms animation — and let a transition settle
before screenshotting or the shot double-images.

Do NOT re-open anything in §5.3 or §5.5 marked user-ruled, and do not delete the roster photo sheet.
```
