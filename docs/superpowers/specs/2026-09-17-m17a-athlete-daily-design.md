# M17a — athlete home, book, class detail, and the shared class card

| | |
|---|---|
| Roadmap | `docs/ROADMAP-AT-A-GLANCE.md` row 12 |
| Branch | `m17a-athlete-daily` |
| Status | **Living spec.** Brainstormed 2026-09-17. The user expects parts to move during shaping and building ("right now I can't see the full picture"). Every shape decision is written back into §5 of this file for its screen before that screen's build starts. |
| Baselines at start | backend 852/0/0/0 · Karma 1018 SUCCESS · build 0 warnings (re-measured 2026-09-17) |

## 1. What M17a is

The athlete's daily surface, rebuilt through the impeccable routine one screen at a time:
**Book**, **class detail**, **Home** — plus **coach Classes' rows**, because the class card is
**one shared component** across athlete Book and coach Classes, with the actions differing by role
(user-ruled 2026-09-06). `docs/design-ref/screens/booking-screen-example.webp` is the binding card
shape: full-bleed image, text on a scrim over it, not a thumbnail beside text.

### 1.1 Rules carried from M14c-b (binding, user-ruled 2026-09-16)

- **Past day** (`isPastDay`, local calendar day before today): coach card offers **Check-in only**
  (no Build, no Run); athlete card reads **Finished**, shows **Attended** if checked in or **Booked**
  if booked, **no spots line, no Book**.
- **Today, started:** athlete sees "Started HH:mm" + Attended/Booked, no action.
- **A checked-in athlete never sees Book or Cancel.**
- Calendars keep `[min]="-3650"` and `[jump]="true"`; sessions keep loading through
  `sessionWindow`/`covers`.
- Any count of "who is in the class" uses `BookingRepository.IN_CLASS`.

### 1.2 Decisions taken in brainstorming

| # | Decision |
|---|---|
| D1 | **Class detail carries the booking action** (Book / Join waitlist / Cancel / Leave), same state rules as the card, one full-width `strong` button. |
| D2 | **Home keeps its set and gains:** greeting + date, a *no active plan* blocker, WOD folded into today's next-class card, who's going, a habit-based suggestion, a log-your-score link, a mini week strip of attended days. |
| D3 | **The suggestion understands the athlete** — it proposes the slot they actually attend ("always Monday 19:00"), never a generic next class. No habit → no suggestion. |
| D4 | **Log-your-score is a link to `/athlete/wod`.** The logger itself is rebuilt in **M17b**. |
| D5 | **Stat tiles are replaced**: a mini week strip of days attended, the (already weekly) streak as one quiet line under it, and last PR + plan days given a real visual treatment (decided in Home's shape). Streak depth and entitlement usage stay **M17c**. |
| D6 | **Approach 1:** presentational `ui/class-card` with projected badge/actions + a pure `class-state.ts` shared by Book, detail and Home. |
| D7 | Build order: backend → card (gallery) → Book → coach Classes → class detail → Home. |

## 2. Backend (no migration)

1. **`SessionView.imagePath`** — signed class-type image, resolved session → schedule slot → class
   type exactly as `SessionDetailController.detail` does. Slots and types resolved once per request,
   not per row. Book's name-matched `listTemplates()` lookup is deleted.
1b. **`SessionView.coachAvatarPath` and `SessionView.people`** (added at shape, 2026-09-17) — the
   coach's signed avatar, and the first 5 IN_CLASS athletes as `{name, avatarPath}` (signed), in
   booking order. `bookedCount` stays the total, so the card's `+N` is `bookedCount − people.length`
   (drop-in visitors are counted but not named, as `booked` already does). Same exposure as class
   detail's grid, which every member can already see.
2. **Per-limit 409 reason.** `BookingService.book` returns the violated rule's code
   (`ENTRIES_TOTAL | ENTRIES_PER_MONTH | ENTRIES_PER_WEEK | ENTRIES_PER_DAY`) as the 409 detail
   instead of `LIMIT_REACHED`; cancel returns `CANCELLATIONS_*` instead of `CANCEL_LIMIT_REACHED`.
   `ledger.firstViolated` already names the rule. Tests asserting the old strings are updated
   (backend and e2e — grep for both).
3. **`HomeDto.hasActivePlan: boolean`** — `planDaysLeft == null` cannot tell "no plan" from
   "unlimited".
4. **`HomeDto.attendedThisWeek: LocalDate[]`** — box-local dates of this week's CHECKED_IN bookings
   (Monday-anchored, same window as `checkinsThisWeek`).
5. **`HomeDto.suggestion`** — `{sessionId, name, startAt, imagePath, bookedCount, capacity} | null`:
   - habit = the `schedule_slot_id` with the most CHECKED_IN bookings for the caller in the last
     8 weeks, **at least 2**;
   - suggest that slot's next `SCHEDULED` session starting in the next 7 days that the caller holds
     no non-cancelled booking on and that has room (`IN_CLASS` count < capacity);
   - if the top slot yields nothing, try the next habit slot; ties → soonest session; none → `null`.
   - Tenant-scoped through the normal filter; this runs on a user request, so no `runAsRoot`.
   - Tests: happy, no history, one visit only, already booked, full, next-habit fallback, and a
     cross-tenant case (another box's history never produces a suggestion). `/api/box/home` is an
     existing route, so `AuthzConformanceTest` needs no edit.

## 3. The shared card and state

### 3.1 `ui/class-card` (new component — clean `ui/` rules apply)

**Shape decided 2026-09-17 ("A2", user-picked after four options and three revisions).** Reference
render: `docs/superpowers/sketches/m17a-class-card-a2.html` (bone-ring column) with the title from
`m17a-class-card-title.html` ("500 · Title case").

- **Photo block, 170px tall**, full-bleed class-type image. No image → `--surface-2` with the class
  initials large in `--hairline`, top-right.
- **Light scrim, not adaptive (user-ruled 2026-09-17):** `linear-gradient(180deg, transparent 28%,
  rgba(6,9,7,.5) 55%, rgba(6,9,7,.5) 100%)` — a new token `--scrim-card` holds the .5 colour. The user
  rejected both a darker scrim ("way too dark", "big shadow") and an adaptive one. **Known cost,
  accepted:** on a very bright upload the title can drop below AA (measured 3.4:1 on a pure-white
  photo). The audit will flag it; it is a recorded user decision, not an open P1. Past-day photos are
  greyscaled (`filter: grayscale(.85) brightness(.75)`), which also darkens them.
- **On the photo, bottom-left, two lines:**
  1. **Title · coach** — title Archivo **500, title case**, `--fs-h2`,
     ellipsis; a `·` in `--bone-dim`; the coach's `bh-avatar size="sm"` + first name in `--bone`,
     `--fs-sm`, max 45% of the line. No coach → title only.
  2. **Who's going** — the first **5** athletes as `bh-avatar size="sm"`, overlapped (−9px), each with
     a **2px `--bone` ring** (volt was asked for and declined on the design law; user accepted bone),
     then a `+N` chip (mono, `--fs-meta`, dark translucent fill, hairline border) when more are in.
     Nobody → the text "No one yet — be the first" (`--bone-dim`, `--fs-sm`). The stack is
     `aria-hidden`; the card's accessible text carries "N going".
- **Badge, top-right on the photo**: the state, said once — Booked · Waitlist #n · Full · ✓ Attended
  (and for coaches Draft · Published). Mono uppercase chip with its own dark fill, so it reads on any
  photo. Tones: Attended/Published `--good`, Full `--warn`, others neutral.
- **Strip below the photo** (`--surface`, min-height 56px): left, mono bold time range + a regular
  `--bone-dim` suffix that carries the count or phase ("· 4 left", "· 3 in line", "· 1 ahead",
  "· started", "· finished"; coach: "· 8/12 booked"); right, the projected action. The badge never
  repeats the strip ("Full · 3 in line" was rejected as redundant).
- Buttons are never on the photo. Cancel / Leave / Join waitlist / coach actions are `bh-button`
  `ghost`; **Book is `solid`** — a list holds several co-equal Book buttons, and the design law caps
  `strong` (the bone fill the sketch showed) at one per screen.
- Inputs (signal): `title`, `image`, `coach`, `coachAvatar`, `people: {name, avatarPath}[]`,
  `peopleCount`, `emptyText`, `start`, `end`, `suffix`, `href`, `tone` (`default | past`), `testId`.
  Projected slots: `[badge]`, `[actions]`, `[error]`.
- Gallery section at `/app/dev/components` with every state; states it cannot have are declared.
  Visual baselines via `e2e/visual.sh`. `interaction-design` pass applies (new component).

### 3.2 `features/booking/class-state.ts`

`athleteState(s: SessionView, now: Date)` →
`{ phase: 'finished' | 'started' | 'upcoming'; mine: 'attended' | 'booked' | 'waitlist' | null;
position: number | null; action: 'book' | 'waitlist' | 'cancel' | 'leave' | null;
spotsLeft: number | null }`

- `finished` = `isPastDay(startAt)`; `started` = today and `startAt <= now`.
- `finished`/`started` → `action = null`; `finished` → `spotsLeft = null`.
- CHECKED_IN → `mine = 'attended'`, `action = null` in every phase.
- Unit-tested over the full phase × booking-status × capacity matrix.

Coach Classes computes its own actions inline: Check-in always; Build and Run only when
`!isPastDay`. Draft/Published goes in the badge slot.

## 4. Errors and copy

- **The booking outcome is a bottom banner (`bh-banner`), not card-inline (user-ruled 2026-09-18).**
  This supersedes the backlog item that asked for the error in the card foot: the result of an action
  — failure *and* confirmation — belongs in the floating bottom message, which already clears the
  dock and dwells 7s on `danger`. Failure → `tone="danger"` with `bookingReason(detail)`; success →
  `tone="good"` naming the class. The card itself shows no error text. A failed **load** still renders
  its stateline in place (it is not the outcome of an action).
- **A cancellation is a red outcome, and it is confirmed first (user-ruled 2026-09-18).** Cancel and
  Leave waitlist open a `bh-sheet` confirm ("Cancel this booking?" + what it costs); the sheet's
  execute control is a **filled `danger`** button, matching the design law's pair — the card's
  danger-bordered ghost OPENS the flow, the filled button EXECUTES it. The resulting banner is
  `tone="danger"`, not `good`: losing a place is not a success. Book / Join waitlist stay
  unconfirmed and keep the `good` banner.
- **The dev seed ships real photos (user-ruled 2026-09-18):** `backend/src/main/resources/dev-seed/`
  holds three class photos and four portraits; `DevDataSeeder` copies them instead of generating flat
  colour PNGs, so photo-driven screens are judged on something like real content.
- Copy for every 409: each `ENTRIES_*` and `CANCELLATIONS_*` code, `NO_ACTIVE_SUBSCRIPTION`,
  `PAST_CUTOFF`, `ALREADY_BOOKED`, `CANCELLED`, `PAST`, and a generic fallback.
- Pill labels ("Booked", "Waitlist #n", "Full · n in line", "Attended", "Finished") are `$localize`d.
- All four screens: strings i18n-marked, dates/numbers locale-formatted, each screen converts its own
  decorators / Eager pin.

## 5. Screens (shape decisions land here)

Each: **shape (3–4 options) → build → user visual sign-off → audit ≥16/20 → fix P0/P1 →
critique ≥32/40 in Chrome.** All four are plumbing under the shell volt rule: no volt; a lone
primary action is `bh-button variant="strong"`.

### 5.1 Book
Week strip (unchanged) → a list of §3.1 cards, 12px apart. Badge + suffix + action from
`athleteState`. No-plan athletes still see Book; pressing it shows the plan message inline in that card.
**Shape: decided 2026-09-17 — §3.1's A2 card, nothing else on the screen changes.**

### 5.2 Coach Classes
Same card, coach actions, Draft/Published badge. Keeps the Announce link and the `aria-live` list.

**Shape: decided 2026-09-18 — option B, "second line, equal thirds."**
Render: `docs/superpowers/sketches/m17a-coach-classes.html`, **column 2**
(`m17a-assets/6-coach-classes-options.png`).

Why the card needed a shape round at all rather than being a straight repeat: measured on the live
app at 360px, the card is **328px** wide and the three coach actions total **214px**
(Build 61 · Check-in 84 · Run 53, plus two 8px gaps). Time + meta + three buttons is ~454px, so
unlike the athlete's single action they cannot share the strip's one line.

The decision: the strip keeps line 1 as `HH:mm–HH:mm · {booked}/{capacity} booked · {n} in line`
(the waitlist clause only when `> 0`), and the three actions take a **second line as equal thirds**
spanning the full width (~98px each; "Check-in" needs 84px, so it fits). Build and Run render only
when `!isPastDay(startAt)`; a past day shows Check-in alone, which then spans the full width.
Rejected: A (right-aligned, ragged left edge and a lone far-right button on past days),
C (counts moved onto the photo to keep a one-line strip — tightest at ~226px/card but it drops the
end time and moves data onto the image), D (Check-in ranked wider — as rendered it filled the
button with `--bone`, and `strong` is capped at one per screen, which a list of cards violates by
construction).

Card ≈ 266px, ~2.6 per screen. Equal thirds also gives the largest tap targets of the four, which
is the point on a screen a coach uses standing on the gym floor.

### 5.3 Class detail
Photo hero → coach → Going / In queue grids → one full-width action (D1) with its outcome in the
bottom banner (§4); reload after acting.

**It is the first DETAIL screen (law of 2026-09-18): no dock, a back arrow in the shell header
returning to Book, and the dock's bottom gutter reclaimed for its primary action — while still
carrying its own `<h1>`.** M17a decides the mechanism here (route `data` flag read by the shell vs.
a per-screen input) and every later detail screen follows it; the unconverted ones are filed in
`docs/BACKLOG.md`.

**Shape: decided 2026-09-18 over three rounds.** Renders, in order, each kept as the record:
`m17a-class-detail.html` (four shapes) -> `m17a-class-detail-r2.html` (header/title variants + the
first animation) -> **`m17a-class-detail-r3.html`, column 1 = the screen, column 2 = the live
transition**.

- **Round 1** picked **A, the full-bleed photo hero** (260px, edge to edge, date/time on the scrim)
  over the enlarged card, the compact band and the dense-row roster. Rejected with four corrections:
  the back arrow as drawn did not work, the header must stay, the box name is redundant on a detail
  screen, and the screen was missing its title.
- **Round 2** resolved those into **option 1: the header IS the title bar.** Back arrow replaces the
  box switcher, the class name is the `<h1>`, and **the hero never repeats the name** — it carries
  the photo, the badge and `Fri 18 Sep · 18:00–19:00 · 60'` only. Corrected once more: the shell's
  **mail / notifications / avatar stay exactly where they are on every other screen**; only the
  switcher goes.
- **Round 3** fixed the transition and was locked. See CLAUDE.md's "THE DETAIL HEADER IS SETTLED"
  for the binding form, which governs every non-dock screen, not just this one.

**No volt anywhere on this screen** — user-confirmed 2026-09-18. The switcher's mark was the shell's
one volt element and the back arrow replaced it, so a detail screen has none. Amends the standing
rule rather than making an exception to it.

**The open/close transition is part of the shape, not a polish item.** The tapped card's photo grows
into the hero and collapses back to the row it opened from; the class name is one element that
travels between the row and the header title slot. 280ms, `--ease-move`, symmetric. The two traps
that cost a round: the source row stays `visibility: hidden` until the morph LANDS, and completion
cannot rely on `transitionend` alone or it deadlocks under `prefers-reduced-motion`.

The header's existing hide-on-scroll (below 768px) is kept deliberately — see CLAUDE.md for why.

### 5.4 Home
Content (order decided in shape): greeting + date · plan blocker (no plan / expiring) · next class as
the shared card linking to **`/athlete/class/:id`** (fixes the filed defect) with who's going, and —
when it is today — its WOD pieces and, once ended with an unlogged scoreable piece, a
"Log your score" link to `/athlete/wod` · with nothing booked, the suggestion card (one-tap Book) or
the Book prompt · announcement card + sheet (unchanged behaviour) · mini week strip of attended days
with "N weeks running" · last PR and plan days. *Shape: pending.*

### 5.5 Class workout (added 2026-09-19, user-requested mid-milestone)

An athlete could not see the programming of **any** class other than today's: `MyClassController`
is hardcoded to today and to one session (the athlete's booked class, or the only class of the
day). So an athlete who books tomorrow's 18:00, or is choosing between two classes today, has no
way to read the workout. This screen closes that.

**It is a read-only visual of the class — never a log board.** No score logging, no leaderboard
links, no "Log your score". Those belong to M17b's WOD board, which is a hero screen with a
different job; this one answers "what is this class" for someone deciding or preparing.

**Route:** `/athlete/class/:id/workout`. It is a **detail screen** under the law of 2026-09-18 —
no dock, back arrow, bottom gutter reclaimed, its own `<h1>` — and the back arrow returns to **the
class** (`/athlete/class/:id`), not to Book. **Therefore it carries no volt at all**, same
amendment as class detail: the back arrow replaced the switcher's mark. Identity here comes from
the mono prescription voice and the type scale, never from colour.

This is the **second consumer of the detail mechanism** and the one that extends it: `backTo` is a
static string in route `data` today, and here it must resolve the parent's `:id`. `backTo` grows
to accept a parent-relative target; every later nested detail screen inherits that.

**Header title is "Workout"**, with the class named in a mono line directly below. Not the class
name — that would make this header identical to class detail's, and the athlete could not tell
they had moved.

**No backend change.** `GET /api/box/sessions/{id}/items` already exists, is already reachable by
an athlete, and already enforces the privacy rule: `if (!isStaff() && !"PUBLISHED".equals(...))
return List.of()`. The full `Wod` (blocks, bodyText, scalingNotes) rides inside each `ItemDto`, so
the screen is **one request**. `ProgrammingService.sessionItems()` already exists on the frontend.

**Entry point:** a full-width row on class detail, under the coach row — **not** a second control
in the action bar, which holds that screen's one primary action. The row is **absent entirely**
when the class is not `PUBLISHED`: no disabled state, no teaser. Class detail already receives
`programmingStatus` in its existing fetch, so the gate costs no extra request.

**Shape: decided 2026-09-19 over two rounds.** `m17a-class-workout.html` (three treatments) ->
**`m17a-class-workout-r2.html` = the locked form**. Renders kept in `m17a-assets/`.

- **Round 1 chose B, the board sheet**: pieces flat on `--ground`, separated by hairline rules,
  the prescription set large in mono. It reads like the gym whiteboard and earns its identity
  through type, which is the only budget a volt-less screen has. Rejected: A (piece cards, reads
  as plumbing) and C (run-of-class rail, implies a timeline the data has no durations for).
  Measured, not estimated: four pieces run **C 621px < A 740px < B 834px** in a 702px viewport.
  B is the tallest and shows 3 of 4 pieces — accepted knowingly for the legibility.
- **Round 2 corrected B against the model and locked two sub-decisions**, both user-ruled
  **against** the recommendation, and both leaving shared code untouched:
  - **B2 — a sub-block's label is a chip and its lines stay full width, no indent.** The model is
    exactly two levels (`WodBlock.blocks`) and a coach can author a buy-in/work/cash-out chipper
    today. B1 (indent behind a hairline) was recommended for unambiguous nesting; B2 keeps the
    full movement column and the flat board feel. Known cost, accepted: several sub-blocks in a
    row lean toward reading as separate pieces — mitigated by the chip being far smaller than the
    `--fs-display` piece title.
  - **N2 — a block's `note` renders UNDER its lines.** The two existing renderers disagreed
    (`expandedRows` emits the note after the lines, `wod.page.ts` draws it before, beside the
    label). N2 matches `expandedRows`'s current order, so **nothing shared changes** and the class
    builder and WOD library keep their behaviour.

**Two corrections applied before the user saw round 2, both found by checking the model rather
than by looking:**
1. **The unit lives on the LINE, not in the load column.** `{text:"Row", reps:"8", unit:"CAL"}`
   prints `8 cal Row` — `prescriptionLines()` already does this. Round 1 drew "cal" on the right
   where a load belongs.
2. **`expandedRows()` silently drops `line.scales`.** It maps `reps/text/load/unit` and never
   carries the scaled variants, so reusing the shared flattener as-is would delete every `↳`
   line. It gains a `scales` passthrough; `prescriptionLines` is unaffected because it only reads
   reps/text/load. The renderer is otherwise `expandedRows` + `libMeta`, both already shared —
   `wod.page.ts`'s ~50 lines of hand-rolled recursion are NOT copied into a second screen.

**Empty but published** reads "Nothing posted yet / Your coach hasn't written this class up." A
piece with only `bodyText` renders it as preformatted mono.

## 6. Testing and gates

- Backend: §2's tests; full suite green.
- Karma: `class-state` matrix, `class-card`, each page; full suite green; build zero warnings.
- e2e (on a `down -v` stack): book → cancel; past day reads Finished with no Book; Home next-class →
  detail **by clicking**; detail Book/Cancel; coach past day shows Check-in only; per-limit copy.
- The seed has no past classes — use the SQL in `.superpowers/sdd/progress.md` (M14c-b notes) for
  browser passes.
- Keyboard/focus and 320/360/393 measurements via a throwaway Playwright spec, deleted after.
- `docs/PREFLIGHT.md` at its four moments.

## 7. Out of scope

- Score logger rebuild → **M17b**.
- Streak depth, entitlement-usage analytics → **M17c**.
- `entitlement` / `weeklyClassLimit` wire-shim deletion → the plan-admin rebuild.
- The N+1 in `SessionController.list` (per-session booking and membership lookups) — filed to the
  backlog if it survives §2.1's batching; not fixed wholesale here.
