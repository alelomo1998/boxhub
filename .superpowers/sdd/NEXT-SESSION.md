# Next session — **M17a, mid-milestone: class detail is BUILT and its transition works; the class workout screen is shaped and unbuilt**

| | |
|---|---|
| Branch | **`m17a-athlete-daily`** — 27 commits ahead of `main`, tree clean, NOT merged |
| Spec | `docs/superpowers/specs/2026-09-17-m17a-athlete-daily-design.md` (**living** — §5.1, §5.2, §5.3 and now **§5.5** carry their shape decisions) |
| Plan | `docs/superpowers/plans/2026-09-17-m17a-athlete-daily.md` (**1–12b done**; **12c, 12d are new**, then 13–17) |
| Ledger | `.superpowers/sdd/2026-09-17-m17a-athlete-daily/progress.md` |
| Backend | **864 / 0 / 0 / 0** (orchestrator-run at `e549cca`; untouched since — no backend change in 12a/12b) |
| Karma | **1113 SUCCESS** (orchestrator-run at `5bc7795`) |
| Build | **0 warnings** |
| e2e | `booking-flow`, `library`, `programming` **pass**. `runner.spec.ts:43` **fails — proven pre-existing**, filed in `docs/BACKLOG.md`. Full suite not run on a `down -v` stack; still owed. |
| Visual | `class-card` still has NO baselines — `e2e/visual.sh` owed. The card gained a `.shot` wrapper and a `morphKey` input in 12b, so baselines must be written AFTER that. |

**Never quote these numbers — re-run them first.**

## Done this session

- **Task 12a — class detail BUILT**, matching `m17a-class-detail-r3.html` column 1, and with it
  **the detail-screen mechanism every later non-dock screen inherits**: route `data: { detail,
  backTo }` read from the **deepest** activated route on each `NavigationEnd`, plus
  `ShellChromeService.detailTitle`. Route-owned, not screen-set, so a screen that forgets to reset
  on destroy cannot leak into the next one.
- **Task 12b — the open/close shared-element morph WORKS, both directions, measured.**
- **A user-reported Book defect fixed** (below).
- **The class workout screen shaped over two rounds and LOCKED** (spec §5.5). **NOT BUILT.**

### The transition was built on native View Transitions, not the sketch's overlay morph (user-ruled)

`withViewTransitions()` in `provideRouter`, with `onViewTransitionCreated` calling
`skipTransition()` unless the navigation enters or leaves a detail route — that skip is the only
thing keeping a **global** router option scoped to one screen. The locked shape is unchanged;
the mechanism makes both of the prototype's traps structurally impossible (no source row to hide,
no `transitionend` to wait on, and the router resolves whether or not anything animates, so
`prefers-reduced-motion` cannot deadlock it). Back-navigation needed **no second code path** — the
browser pairs snapshots by `view-transition-name`, so the collapse is the same pair reversed.

**The real work was the precondition, on BOTH sides: a morph can only pair elements that are
PAINTED when the router snapshots.** This is the thing to remember for every later detail screen.

- Leaving: Book refetched on init, so it was empty for a tick and the hero faded instead of
  collapsing. Book's `sessions`/`dayOffset`/window moved into a root-provided **`BookStore`**; a
  cache hit renders immediately, then revalidates **silently**. The store also remembers `scrollY`,
  or the collapse lands on empty space.
- Entering: class detail painted "Loading class…" and only built the hero after the fetch. It now
  **seeds the hero synchronously from `BookStore`** (a `HeroSeed`, deliberately not a partial
  `SessionDetail`) and names it from the route id. The action bar's height is reserved but its
  contents wait for the real fetch — a guessed action is worse than a late one. Cold load / deep
  link has no seed and no source card, so it falls back and simply does not animate.

Measured with Playwright at 393px, scrolled (scrollY 695, card index 3): open interpolates
`359x170@(17,311)` → 366 → 376 → 388 → `393x260@(0,61)`; close returns to `359x170@(17,311)`;
scrollY 695 before and after.

### The Book "page refresh" defect (user-reported, fixed)

Tapping Book or Cancel appeared to refresh the page. Not a navigation — `bh-button` defaults to
`type="button"` and Book has no `<form>`. `act()`'s success handler called `load()` on the
**non-silent** path, flipping `loading`, and the template's first branch replaces the whole card
list with a "Loading classes…" stateline — so all cards unmounted and remounted. Now `load(true)`.
A revalidate that fails after a successful action keeps the cached list rather than dropping into
the error block; the banner is the athlete's confirmation.

Verified on the running stack, not only in Karma: 49 samples across each action, card count never
dropped (9/9 book, 3/3 cancel), "Loading classes…" never rendered, card still flipped Book↔Cancel.

**Sibling callers checked** (root cause, not the reported symptom): coach Classes has no
post-action reload, class detail's `reload()` was already silent. **Home only loads on init today,
but Task 14 adds one-tap Book from the suggestion card — build that silent from the start or this
defect comes straight back.**

## Owed before the milestone closes — start here

**Task 12c — build the class workout screen + the entry row on class detail.** Spec §5.5 is
binding; the shape is LOCKED at `docs/superpowers/sketches/m17a-class-workout-r2.html`
(**B2** sub-blocks, **N2** note placement). Read the plan's Task 12c for the full contract. The
short version:

- **No backend change.** `GET /api/box/sessions/{id}/items` already exists, is already athlete-
  reachable, and already enforces privacy (`!isStaff() && !PUBLISHED -> List.of()`). The full `Wod`
  rides inside each `ItemDto`, so the screen is **one request**.
- **Two model facts that will bite if missed:** the unit is stored on the LINE
  (`{reps:"8", unit:"CAL"}` prints `8 cal Row`, never a load-column value), and **`expandedRows()`
  silently drops `line.scales`** — reuse it as-is and every `↳` scaled line disappears. It needs a
  `scales` passthrough. **Do not move its `note` push** — N2 deliberately keeps the current
  after-the-lines order so the class builder and WOD library are untouched.
- **`backTo` must grow to accept a parent-relative target** (this screen returns to
  `/athlete/class/:id`). Extend the mechanism ONCE in `ShellChromeService`; every later nested
  detail screen inherits it. This is the second consumer of 12a's mechanism and the one that
  stretches it.
- Renderer is **`expandedRows` + `libMeta`** — do NOT copy `wod.page.ts`'s ~50 lines of hand-rolled
  recursion into a second screen.

**Task 12d** — its gate. Then **13** (class detail gate), **14–15** (Home shape + build + gate),
**16** (e2e wiring spec), **17** (close-out).

## Rules the user ruled DURING this milestone (all binding, all in CLAUDE.md)

1. **Shape is RENDERED, never described** — HTML sketches served locally, opened in the user's own
   Chrome tab, plus a Playwright PNG. Iterated as new files.
2. **Every screen carries a visible `<h1>`.**
3. **A screen that is not a dock tab is a detail screen:** no dock, back arrow, bottom gutter
   reclaimed, `<h1>` still present.
4. **Booking outcomes are a bottom `bh-banner`**; a failed *load* keeps its own stateline.
5. **Cancelling is confirmed in a `bh-sheet`** (danger ghost opens, filled danger executes).
6. **Card actions:** Book `solid`, Join waitlist `ghost`, Cancel/Leave `ghost-danger`.
7. **The class card's scrim is light and NOT adaptive** — a recorded decision, never an open P1.
8. **Coach Classes' three actions are a full-width second line, equal thirds.**
9. **THE DETAIL HEADER IS SETTLED** — back arrow · the screen's `<h1>` · the shell's usual
   right-side actions. Only the box switcher goes. Governs EVERY non-dock screen.
10. **A detail screen has NO volt at all.**
11. **Opening a detail screen is a shared-element transition** — now native View Transitions.
12. **NEW 2026-09-19 — the class workout screen is a read-only VISUAL of the class, never a log
    board.** No scoring, no leaderboard links; those are M17b's WOD board, a different screen with
    a different job. It lives in class detail's flow and the back arrow returns to the class.

## Traps hit this session (beyond the standing list)

- **A shared-element morph can only pair elements that are PAINTED when the router snapshots.**
  Both sides needed a fix; neither was obvious until measured. The executor first reported the open
  direction as *frozen* — reporting the failure honestly is what surfaced it.
- **Measure motion with Playwright, never Claude-in-Chrome** — Chrome throttles background tabs.
- **Verify layout claims with measured geometry.** In the round-1 sketch I wrote two captions from
  eyeballing and both were wrong: A was not "2.5 pieces", and C was the most COMPACT option, not
  the most expensive. Measuring changed which trade-off each option actually had.
- **Check a shape against the data model before showing it.** Round 1 of the workout sketch drew
  the unit in the load column and assumed the shared flattener carried scaled lines. Neither was
  true; both were found by reading `prescription.ts`, not by looking at pixels.
- **A `spyOnProperty(window, 'scrollY', 'get')` flakes ~50%** — `shell-header.component.spec.ts`
  redefines `scrollY` as a value property and never restores the accessor, and Karma runs every
  spec file in one page. Use `Object.defineProperty`, which works whatever the current descriptor.
- **A root service that injects `Router` and subscribes in its constructor** (ShellChromeService now
  does) needs a router in every TestBed that touches it.
- Still true: the stack serves **built images**; `down -v` wipes the hand-seeded past classes;
  Claude-in-Chrome cannot type a password and will not go below ~500px, so sign-in and ≤393px
  passes go through Playwright from `e2e/`.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M17a.

cd ~/dev/boxhub && git checkout m17a-athlete-daily && git status
# expect a CLEAN tree at the docs commit (27 commits ahead of main, NOT merged).

FIRST, confirm the baselines yourself — never quote them from the handoff:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test          # expect 864/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless   # expect 1113 SUCCESS
  cd frontend && env -u NODE_OPTIONS npm run build                        # expect zero warnings

THEN, in this order:
1. Task 12c — build the class workout screen and its entry row on class detail. The shape is
   LOCKED; do not re-open it. Spec §5.5 is binding and the reference render is
   docs/superpowers/sketches/m17a-class-workout-r2.html — option B2 for sub-blocks (chip label,
   NO indent) and N2 for a block's note (UNDER its lines). No backend change: the endpoint,
   the privacy gate and ProgrammingService.sessionItems() all already exist.
   Three things that will bite if missed, all in the plan's Task 12c:
     - the unit is stored on the LINE ({reps:"8", unit:"CAL"} prints "8 cal Row"), never a load;
     - expandedRows() silently DROPS line.scales — it needs a passthrough or every scaled line
       disappears — and its `note` push must NOT move, because N2 is what keeps the class builder
       and WOD library untouched;
     - `backTo` must grow to accept a parent-relative target, extended ONCE in ShellChromeService
       so every later nested detail screen inherits it.
   The renderer is expandedRows + libMeta. Do NOT copy wod.page.ts's hand-rolled recursion.
2. Task 12d — its gate: user visual sign-off, then audit (≥16/20), fix every P0/P1, then critique
   (≥32/40) with the browser connected.
3. Task 13 — the class detail gate, same shape, click path Book → card → detail.
4. Tasks 14–17: Home shape + build, Home gate, e2e wiring spec, close-out.

Process, unchanged: ALWAYS a Sonnet subagent per plan task with a short brief pointing at the plan;
executors never commit; the orchestrator reviews every diff and runs every gate itself. Brief every
executor to delete its throwaway specs BY EXACT PATH, never a glob — one wiped four unrelated files.

VERIFY LAYOUT CLAIMS WITH MEASURED GEOMETRY, not a screenshot glance, and CHECK A SHAPE AGAINST THE
DATA MODEL before showing it — the workout sketch's first round drew the unit in the wrong column
and assumed the shared flattener carried scaled lines. Measure motion with Playwright, never
Claude-in-Chrome; Chrome throttles background tabs and reports a working animation as frozen.

A new screen's shape is RENDERED as options in the browser, never described — serve the sketch AND
open it in the user's own Chrome tab, then send the Playwright PNG. Verify navigation by clicking.

The dev stack serves BUILT images — rebuild the frontend (and the backend when the wire changed)
before looking at anything, and note that `down -v` wipes the hand-seeded past classes.
```
