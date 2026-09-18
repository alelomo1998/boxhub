# Next session — **M17a, mid-milestone: Book and coach Classes are closed, class detail is shaped and unbuilt**

| | |
|---|---|
| Branch | **`m17a-athlete-daily`** — 23 commits ahead of `main`, tree clean, NOT merged |
| Spec | `docs/superpowers/specs/2026-09-17-m17a-athlete-daily-design.md` (**living** — §5.1, §5.2, §5.3 now all carry their shape decisions) |
| Plan | `docs/superpowers/plans/2026-09-17-m17a-athlete-daily.md` (Tasks 1–17; **1, 1b, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 done**) |
| Ledger | `.superpowers/sdd/2026-09-17-m17a-athlete-daily/progress.md` |
| Backend | **864 / 0 / 0 / 0**, BUILD SUCCESS (orchestrator-run at `567e352`) |
| Karma | **1075 SUCCESS** (orchestrator-run at `567e352`) |
| Build | **0 warnings** |
| e2e | `booking-flow`, `library`, `programming` **pass**. `runner.spec.ts:43` **fails — proven pre-existing**, filed in `docs/BACKLOG.md`. Full suite not run on a `down -v` stack; still owed. |
| Visual | `class-card` still has NO baselines — `e2e/visual.sh` owed (the gallery gained two sections: the card, and its `actionsLayout="block"` variant). |

**Never quote these numbers — re-run them first.**

## Done this session

- **Athlete Book: the impeccable routine is COMPLETE.** audit **18/20** → every P0/P1 fixed → critique
  **38/40**, no open P0/P1, browser-verified. Snapshot in `.impeccable/critique/`.
- **Coach Classes (Task 10 + 11): built on the shared card and closed.** audit **18/20** → P1 fixed →
  critique **34/40**, no open P0/P1.
- **Class detail (Task 12): SHAPED over three rendered rounds and locked. NOT BUILT.**

### Three real defects found and fixed (all by looking at pixels, not source)

1. **The card's action was clipped out of the card at 200% text zoom.** `.strip` laid two `nowrap`
   spans beside a `flex-shrink:0` action on one line; on a 360px phone Book/Cancel sat ~100px past
   the card's right edge where `overflow:hidden` ate it. **The athlete could not book at all**
   (WCAG 1.4.4). Fixed in the shared card, so coach Classes and class detail inherit it.
2. **A failed load stranded the athlete for ±14 days.** `book.page.ts`'s `load()` committed
   `this.window` *before* the request resolved, so after a failure `covers()` reported the whole span
   as loaded and the `effect` never refetched — changing days silently did nothing, and the error line
   said "try again" with nothing to try. Window now assigned only on success, reset to `NO_WINDOW` on
   failure, and the error state carries a real retry.
3. **Error and empty rendered simultaneously** — a failed fetch claimed both "Couldn't load classes"
   and "No classes this day". Now one exclusive chain, which also stops a day outside the window
   flashing "No classes" from stale data.

Also: card actions moved `[disabled]` → `[loading]` (spinner + `aria-busy`, guard preserved), and the
coach header wraps so Announce is not shoved off-screen at 200% zoom.

## Owed before the milestone closes — start here

**Task 12a — build class detail.** A brief was written and dispatched, then stopped at the user's
request before it wrote anything. Rebuild it from spec §5.3 + the two CLAUDE.md rulings below. It has
two parts:

- **The detail-screen mechanism, which every later non-dock screen inherits.** Decided: a **route
  `data` flag** (`data: { detail: true, backTo: '/athlete/book' }`) read by the shell from the
  *deepest activated route*, recomputed on every `NavigationEnd` — declarative, and unlike a service
  flag it cannot leak into the next screen if a component forgets to reset it on destroy. Plus
  `ShellChromeService.detailTitle = signal<string|null>(null)` for the title, because a class name is
  not known until the fetch resolves and a route title resolver would stall navigation. The shell
  hides the dock (OR it with the existing `dockHidden`, do not break the messaging composer), swaps
  `<bh-box-switcher brand />` for the back arrow, and renders the title as the header `<h1>`.
- **The screen**, matching `docs/superpowers/sketches/m17a-class-detail-r3.html` **column 1**.
  Full-bleed 260px photo hero, mono eyebrow `Fri 18 Sep · 18:00–19:00 · 60′`, badge, coach row,
  4-across Going grid with `✓ in`, In-queue grid, and **one full-width action pinned to the reclaimed
  bottom gutter**. `SessionDetail` lacks `myBookingStatus`/`myPosition`/`bookedCount` — derive them
  from `active`/`queue` entries with `me === true` and feed `athleteState`; **no backend change**.

**Task 12b — the open/close transition.** Part of the shape, not polish. Build it against the working
prototype in the sketch's column 2.

Then Tasks 13–17: detail gate, Home shape + build, Home gate, e2e wiring spec, close-out.

## Rules the user ruled DURING this milestone (all binding, all in CLAUDE.md)

1. **Shape is RENDERED, never described** — HTML sketches served locally, opened **in the user's own
   Chrome tab**, plus a Playwright PNG. Iterated as new files. *(Corrected mid-session: ASCII mockups
   in a question's options violate this, and so does sending only the PNG without opening the page.)*
2. **Every screen carries a visible `<h1>`** matching its dock label and `route.title`.
3. **A screen that is not a dock tab is a detail screen:** no dock, back arrow, bottom gutter
   reclaimed, `<h1>` still present.
4. **Booking outcomes are a bottom `bh-banner`** — green for book/waitlist, red for cancel/leave and
   failures. A failed *load* keeps its own stateline.
5. **Cancelling is confirmed in a `bh-sheet`** (danger-bordered ghost opens, filled danger executes),
   buttons full width.
6. **Card actions:** Book `solid`, Join waitlist `ghost`, Cancel/Leave `ghost-danger`. `--good` is a
   status colour, never an action.
7. **The class card's scrim is light and NOT adaptive.** Accepted cost: ~3.4:1 on a pure-white upload.
   Measured on the real demo photos it is **16.2:1 and 6.9:1**. A recorded decision, never an open P1.
8. **Coach Classes' three actions are a full-width second line, equal thirds** (spec §5.2, option B,
   picked from four rendered options).
9. **THE DETAIL HEADER IS SETTLED** — back arrow · the screen's `<h1>` · the shell's usual right-side
   actions (mail, notifications, avatar). Only the **box switcher** goes; the actions stay. **Applies
   to every non-dock screen**, per the user, not just class detail.
10. **A detail screen has NO volt at all.** The switcher's mark was the shell's one volt element and
    the back arrow replaced it. The standing rule now reads *on every screen that has a switcher* —
    amended, not excepted, so no later screen re-litigates it.
11. **Opening a detail screen is a shared-element transition**: the card's photo grows into the hero
    and collapses back **to the row it opened from**, and the class name is *one element that travels*
    between the row and the header title slot. 280ms, `--ease-move`, symmetric.

## Traps hit this session (beyond the standing list)

- **A screen cannot widen a shared component's internal element from outside.** The first coach build
  styled its own projected wrapper with `width:100%` and shipped **option A while reporting option B**
  — `.acts` is content-sized with `margin-left:auto` and emulated encapsulation puts it out of reach.
  The card now takes an explicit `actionsLayout` input. **Equal grid columns are also not enough**:
  each `bh-button` still hugs its content inside its column until given `class="full"`.
  **Lesson: verify a layout claim with measured geometry, never a screenshot glance.**
- **Chrome throttles background tabs**, so `getComputedStyle` during a transition returns frozen
  values and an animation looks broken when it is fine. Two of my "bugs" were this. **Measure motion
  with Playwright**, not Claude-in-Chrome. Chrome's renderer also hard-timed-out under repeated
  animation polling — back off rather than retrying.
- **`transitionend` alone cannot drive a transition's completion.** Under `prefers-reduced-motion` the
  transition is removed, the event never fires, and the UI deadlocks half-open. Event = fast path,
  duration timeout = guarantee.
- **A shared-element collapse must hold the source row `visibility: hidden` until the morph LANDS.**
  Revealing it on a timer double-images and pops — the user spotted this immediately.
- **A subagent cleaning up with a wildcard `rm` deleted four unrelated untracked files.** Brief every
  executor to delete throwaway specs **by exact path, never a glob**.
- **A screen `<h1>` at `--fs-hero` overflows a 360px viewport at 200% zoom** once the title exceeds
  ~5 characters ("CLASSES" is 393px). App-wide; filed as a shared-title-treatment decision, not
  patched per screen.
- The dev seed **never creates a session before today** (`SessionGenerator` skips past slots), so a
  past-day state can only be exercised by intercepting the network or by the hand-seeded rows.
- Still true: the stack serves **built images** (rebuild frontend, and backend when the wire changed);
  `down -v` wipes the hand-seeded past classes; Claude-in-Chrome cannot type a password and will not
  go below ~500px, so sign-in and ≤393px passes go through Playwright from `e2e/`.

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M17a.

cd ~/dev/boxhub && git checkout m17a-athlete-daily && git status
# expect a CLEAN tree at 567e352 (23 commits ahead of main, NOT merged).

FIRST, confirm the baselines yourself — never quote them from the handoff:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test          # expect 864/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless   # expect 1075 SUCCESS
  cd frontend && env -u NODE_OPTIONS npm run build                        # expect zero warnings

THEN, in this order:
1. Task 12a — build athlete class detail. The shape is LOCKED; do not re-open it. Spec §5.3 plus
   CLAUDE.md's "THE DETAIL HEADER IS SETTLED" are binding, and the reference render is
   docs/superpowers/sketches/m17a-class-detail-r3.html COLUMN 1. This task also decides the
   detail-screen mechanism for every later non-dock screen: a route `data` flag read by the shell,
   plus ShellChromeService.detailTitle for the dynamic title. Reasoning is in the handoff.
2. Task 12b — the open/close shared-element transition. It is part of the shape, not polish. A
   WORKING prototype is column 2 of that same sketch — read its JS before writing any. Two traps are
   already paid for there: hold the source row hidden until the morph LANDS, and never let
   `transitionend` alone signal completion or prefers-reduced-motion deadlocks the screen.
3. Task 13 — the detail gate: user visual sign-off, then audit (≥16/20), fix every P0/P1, then
   critique (≥32/40) with the browser connected.
4. Tasks 14–17.

Process, unchanged: ALWAYS a Sonnet subagent per plan task with a short brief pointing at the plan;
executors never commit; the orchestrator reviews every diff and runs every gate itself. Brief every
executor to delete its throwaway specs BY EXACT PATH, never a glob — one wiped four unrelated files.

VERIFY LAYOUT CLAIMS WITH MEASURED GEOMETRY, not a screenshot glance: the first coach Classes build
reported option B and had shipped option A. Measure motion with Playwright, never Claude-in-Chrome —
Chrome throttles background tabs and reports a working animation as frozen.

The dev stack serves BUILT images — rebuild the frontend (and the backend when the wire changed)
before looking at anything, and note that `down -v` wipes the hand-seeded past classes.
```
