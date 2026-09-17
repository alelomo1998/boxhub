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

- Signal inputs only: `image`, `title`, `coach`, `start`, `end`, `meta`, `href`, `tone`
  (`default | past`), `testId` (bound on the inner link — host attributes don't reach it).
- Projected slots: **badge** (over the image) and **actions** (card foot). The card owns layout; the
  page owns role logic.
- Full-bleed image under a `--scrim` gradient, text on the scrim. No image → `--surface-2` block with
  the class initials. Tokens only; mono for times/counts, tabular numbers.
- Gallery section at `/app/dev/components` with every state; states it cannot have (e.g. disabled on
  a link card) are declared. Visual baselines via `e2e/visual.sh`.
- `interaction-design` pass applies (new component).

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

- The booking error renders **in the foot of the card that caused it** (Book) or under the action
  (detail), never at the list top.
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
Week strip (unchanged) → class cards. Badge + action from `athleteState`. No-plan athletes still see
Book; pressing it shows the plan message inline. *Shape: pending.*

### 5.2 Coach Classes
Same card, coach actions, Draft/Published badge. Keeps the Announce link and the `aria-live` list.
*Shape: pending.*

### 5.3 Class detail
Photo hero → coach → Going / In queue grids → one full-width `strong` action (D1) with inline error;
reload after acting. Error state keeps the way back to Book. *Shape: pending.*

### 5.4 Home
Content (order decided in shape): greeting + date · plan blocker (no plan / expiring) · next class as
the shared card linking to **`/athlete/class/:id`** (fixes the filed defect) with who's going, and —
when it is today — its WOD pieces and, once ended with an unlogged scoreable piece, a
"Log your score" link to `/athlete/wod` · with nothing booked, the suggestion card (one-tap Book) or
the Book prompt · announcement card + sheet (unchanged behaviour) · mini week strip of attended days
with "N weeks running" · last PR and plan days. *Shape: pending.*

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
