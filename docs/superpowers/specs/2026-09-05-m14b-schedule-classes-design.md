# M14b — schedule & classes surfaces

**Date:** 2026-09-05
**Status:** design agreed, plan not yet written
**Roadmap position:** #9 in `docs/ROADMAP-AT-A-GLANCE.md`
**Depends on:** M14a (the class/programming model), M13c (the component library), M23 (the shells)

---

## 1. What this milestone is

The schedule surfaces, rebuilt on the M14a model, and one new shared component.

Four deliverables:

1. **`bh-week-calendar`** — a new `bh-*` component, deferred out of M13c because its API depended on
   scheduling interactions that did not exist yet. It **replaces `bh-day-pager`, which is deleted.**
2. **The classes page** — `coach/classes.page.ts`, on the new component.
3. **The admin schedule page** — `admin/schedule.page.ts`, rebuilt. Slot list, week calendar, and the
   **first UI that can edit a slot's schedule**.
4. **The admin class-detail modal** — a `bh-sheet` off the admin week calendar.

Plus two consumers that adopt the new component: `athlete/book.page.ts` and
`messaging/announcements.page.ts`. Both are **component swaps, not screen rebuilds**.

It also closes one backlog entry and fixes one live defect, both forced by deliverable 3 — see §5.

### 1.1 The filed complaint this exists to fix

> **Day pager** (Book + coach Classes): no swipe, chevrons outside the thumb zone, no week-strip with
> availability dots — **paging to the next open class can take 13 taps**. 14-day bound.
> — `docs/BACKLOG.md:331`

13 taps is the real worst case: the horizon is 14 days, the pager moves one day per tap, and nothing
tells you which day has an open class, so you tap blind to the end.

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Week strip + day list**, not a 7-column grid and not a paging-free week agenda. | It is literally what the complaint asks for, and it matches the dotted mini-calendar in `docs/design-ref/components/calendar-screen-builder-example.webp`. A true week grid needs horizontal scroll at 360px, which the mobile-first rule treats as a smell — and the admin shell already carries an unresolved 401px horizontal-overflow bug (`docs/BACKLOG.md`) that a scrolling grid would sit on top of. |
| 2 | **Three ways to move: chevrons page a WEEK, swipe pages a DAY, tapping a dot jumps.** | Each fixes a named half of the complaint. Chevrons paging a *day* is what makes 13 taps possible; paging a week makes the horizon 2 taps wide. Swipe supplies the gesture the complaint says is missing. The dot jump makes the worst case **1 tap**, and it is the only one of the three that uses the availability information. |
| 3 | **The chevrons move inside the strip.** | "Chevrons outside the thumb zone" is the second half of the complaint. The strip is the control; its own controls live in it. |
| 4 | **Availability dots are computed client-side. No backend change.** | Every consumer already fetches the whole horizon with one `listSessions(from, to)` call, so the per-day rollup is a `computed()` over data already in the page. A `/availability` endpoint would be a second source of truth for a number the page is already holding. |
| 5 | **`bh-day-pager` is deleted, all four consumers swap.** | `bh-week-calendar`'s API is a superset, so three of the four swaps are mechanical. Shipping both leaves two components doing one job, each owing a gallery section and a seven-state ledger. |
| 6 | **`athlete/book.page.ts` and `messaging/announcements.page.ts` are swaps, not rebuilds.** | They belong to M17a and M29a. The component changes; the cards, booking calls, error copy and picker behaviour do not. Milestone lock holds on everything except the component. |
| 7 | **Editing a slot regenerates through `SlotRegenerationService`, and a refusal is reported, never worked around.** | M14a decision 11: regeneration refuses a range holding a live booking rather than cancelling it. Both destructive alternatives send mail, and an admin adjusting a schedule must not be able to mail forty people by accident. |
| 8 | **A capacity change is NOT applied in place to already-generated sessions.** | It would dodge the refusal for the one field where nothing breaks, but it is a second mechanism beside the one M14a specified, and "which fields regenerate and which mutate" becomes a rule nobody can remember. Backlog it; revisit if the refusal proves too blunt in the pilot. |
| 9 | **A RENAME updates future sessions' names in place and never regenerates.** | `ClassSession.name` is a snapshot (`SessionGenerator.java:84`), so today a rename leaves every already-generated session carrying the old name — the board shows the old name until the horizon rolls over. This is **not** decision 8 in disguise: a name is not a booking-relevant number, so updating it invalidates nothing, whereas regenerating for a typo fix would be refused on any booked slot. Bounded to sessions that have not started, so history keeps the name it ran under. |
| 10 | **Deactivating a slot still leaves its already-generated sessions bookable** — unchanged behaviour, and deliberately so. | Cancelling them is a member-visible act that sends mail; `PATCH /sessions/{id}` with `status: CANCELLED` is the existing, explicit way to do that, one session at a time. Named here so the unchanged behaviour is not mistaken for an oversight. If the pilot wants "deactivate and cancel the rest", that is a new decision with a mail blast attached. |

---

## 3. `bh-week-calendar`

### 3.1 API

```ts
export type DayTone = 'open' | 'full' | 'none';

// bh-week-calendar
offset = model(0);                              // days from today — same contract bh-day-pager had
max    = input(13);                             // inclusive upper bound, default = a 2-week horizon
tones  = input<Record<string, DayTone>>({});    // keyed 'YYYY-MM-DD'; absent key === 'none'
```

`offset` stays the contract `bh-day-pager` already had, which is what makes three of the four swaps
mechanical. `tones` is optional: a consumer with no availability data (the announcements picker)
passes nothing and gets a working strip with no dots.

**`max` default 13 is not arbitrary.** `Box.bookingHorizonWeeks` defaults to **2**
(`Box.java:15`, `V3__scheduling.sql:2`), so 14 days is exactly the horizon the backend generates
into. The three schedule screens already hardcode `[max]="13"`; the default now records why.

### 3.2 Layout at 360px

```
┌────────────────────────────┐
│ ‹   SEPTEMBER 2026      ›  │   chevrons page a WEEK, inside the strip
│  M   T   W   T   F   S  S  │
│  1   2   3  [4]  5   6  7  │   [4] = selected
│  ●●  ●●  ●   ●●  ●   ○  ·  │   ● open   ○ full   · none
├────────────────────────────┤
│ 06:00  CROSSFIT            │   the day list is projected content —
│        8/12 · Coach Ana    │   the component owns the strip, not the rows
│ 17:30  CROSSFIT            │
│        FULL · 3 in line    │
└────────────────────────────┘
   swipe ←/→ pages a DAY
```

The strip renders the **calendar week containing the selected day**, Monday-first. Days before today
or beyond `max` render dimmed and are not tappable — they are out of the horizon, and a control that
looks tappable and does nothing is worse than one that reads as unavailable.

Two strips therefore cover the whole horizon, so the chevrons need at most one press to put any
bookable day on screen.

### 3.3 The dots

One dot per day, tone from the day's sessions:

| Tone | Meaning | Rendered |
|---|---|---|
| `open` | at least one session with a free place | `--bone` |
| `full` | sessions exist, every one at capacity | hollow ring, `--faint` |
| `none` | no sessions that day | a 2px `--faint` tick |

**The dots are not volt.** The box switcher's mark is the shell's one volt element and every screen
inside a shell starts with its volt budget already spent (design law, ruled 2026-08-27). The
selected-day marker is `--bone`; volt would also be wrong on meaning, since a dot answers *"is there
room"*, not *"live / now"*.

**Dots must survive colour-blindness**, so tone is carried by **shape** (filled / hollow / tick), not
by hue alone. Each day's accessible name states it in words — `"Friday 5 September, classes full"` —
so the strip is usable without seeing a dot at all.

### 3.4 Swipe

Native pointer events, no library. Horizontal intent only: a gesture is a page if |dx| > 40px and
|dx| > |dy|, so a vertical scroll through the day list is never stolen. `touch-action: pan-y` on the
strip keeps the browser's own vertical scrolling.

Swipe is an **enhancement, never the only route** — every day reachable by swipe is reachable by a
dot tap and by the chevrons, which is what keeps the component keyboard- and screen-reader-complete.

### 3.5 Accessibility

- The strip is a list of buttons, one per day, each with a full accessible name (weekday, date and
  availability in words). Arrow keys move between days; the selected day is `aria-current="date"`.
- The selected day's change is announced `aria-live="polite"`, as `bh-day-pager` did.
- Focus ring is the standard solid 2px `--focus`. Nothing here is a volt surface, so no `--focus-inv`.
- **44px minimum tap target per day.** Seven of them at 360px is ~51px each, so the strip fits without
  compromise — verify at **320px**, where it is ~45px and tightest.

### 3.6 Seven states (the dev-gallery ledger)

`bh-week-calendar` gets its own `data-gallery` section rendering every state, and an entry in the
gallery `ledgers` record. Karma enforces that all seven are accounted for.

| State | How | Note |
|---|---|---|
| default | rendered | a week with a mix of all three tones |
| hover | hand | day cells take a hover background |
| focus | hand | ring on a day button |
| active | rendered | the selected day |
| disabled | rendered | days outside `[0, max]`, dimmed and untappable |
| loading | **na** | it renders dates it derives itself; the screen beside it owns the fetch and its spinner. Absent `tones` is a legitimate resting state, not a loading one. |
| error | **na** | a date cannot fail to be a date; the screen renders any fetch error |

`interaction-design` applies — this is a new component.

### 3.7 Two traps this component walks into

- **Visual baselines are date-sensitive.** The strip derives from `new Date()` client-side, exactly
  like `bh-day-pager`'s `{{ day() | date }}`. `e2e/tests/visual.spec.ts` freezes to
  **Wednesday 12 August 2026** via `page.clock`, installed **before** `page.goto()` — that mechanism
  keeps working, and the freeze landing mid-week is convenient: the strip renders Mon 10 – Sun 16
  with a selected day that is neither the first nor last cell.
- **Replacing the gallery section shifts every baseline below it.** Playwright rejects a screenshot
  on a **dimension** mismatch before it consults `maxDiffPixels`, so a 1px reflow reads as a hard
  failure rather than being absorbed by the 100-pixel tolerance. The strip is taller than the pager
  it replaces. Expect to regenerate the baselines below the section and **run `e2e/visual.sh` in the
  Linux container**, never Playwright locally.

---

## 4. The screens

### 4.1 `coach/classes.page.ts`

The component swap plus the day list it already had. The existing empty-state copy —
*"Flip through the week with ‹ ›"* — describes a control that no longer behaves that way and must be
rewritten to name the strip.

### 4.2 `athlete/book.page.ts` — swap only

`bh-day-pager` → `bh-week-calendar`, and a `computed()` supplying `tones` from `sessions()`. The photo
cards, booking calls and error copy stay M17a's. The stale `LIMIT_REACHED` copy and the missing
`CANCEL_LIMIT_REACHED` case stay open and stay M17's — noted here so they are not re-filed.

### 4.3 `messaging/announcements.page.ts` — swap only

The class-segment picker passes no `tones`. It binds `[offset]`/`(offsetChange)` rather than the
two-way form; both work on a `model()`.

### 4.4 `admin/schedule.page.ts` — rebuilt

The only genuine rebuild. What is wrong with it today:

- `(ngSubmit)` + `FormsModule` — the M13d form contract bans exactly this, and it is what put a
  password in a URL once already.
- A native `<select>` of weekdays, and slot creation as a cramped inline `.row` of bare inputs.
- **No i18n marks at all** — the whole screen is hardcoded English.
- `ChangeDetectionStrategy.Eager` and `@Input()`-era patterns.
- Desktop-shaped: an inline form row and a `bh-data-table` of "next two weeks", at 360px.

Rebuilt as: **week calendar → that day's sessions → tap a session for the detail modal**, with the
slot list and a slot editor in a `bh-sheet`. Native `<form (submit)="submit($event)" novalidate>`
with `event.preventDefault()`; `bh-field`/`bh-select` bound `[(value)]` against signals; every string
marked; **one `bh-button variant="strong"`** as the primary action, since this is a plumbing screen
with no volt to spend.

### 4.5 The admin class-detail modal

A `bh-sheet` opened from a session in the admin week calendar. Contents: name, time, coach, capacity
and booked/waitlist counts, the roster with per-athlete status, cancel-this-session, and a link into
the builder.

**It adds no read endpoint.** `GET /api/box/sessions/{id}/detail` and `GET /api/box/sessions/{id}/roster`
already serve all of it.

`bh-sheet`'s `open` is a **one-way input, not a `model()`** — the caller MUST reset its own signal to
`false` on `(closed)`, or the sheet will not reopen. This is documented on the component and has
caught callers before.

**The shell does not unmount on an in-shell route change**, so the sheet must be closed explicitly
when navigating from the modal into the builder, or it stays open behind the new screen.

---

## 5. Backend

No new routes. No migration.

### 5.1 The live defect: `PATCH /api/box/class-templates/{id}` generates additively

`ClassTemplateController.patch` accepts `weekday`, `startTime`, `durationMin`, `capacity` and
`coachId`, writes them to the slot, and then calls **`generator.generateForBox(...)`**, which is
**additive only** — `generateForSlot` creates sessions that do not exist and skips ones that do
(`existsByScheduleSlotIdAndStartAt`). It never deletes.

So moving a slot from 06:00 to 07:00 **keeps every already-generated 06:00 session** and adds 07:00
sessions beside them. The box gets duplicate ghost classes and the old time never goes away.

This is **live, not latent**. The UI cannot reach it only because `schedule.page.ts` sends nothing but
`{active: false}`; the endpoint is `COACH`-reachable by anyone with an HTTP client. It was found while
planning this milestone, by reading the patch path that deliverable 3 has to use.

**Fix:** when a scheduling field changes, `patch` calls `SlotRegenerationService.regenerateFrom`
instead of `generateForBox`.

**Which fields do what** — the rule has to be writable in one table or nobody will remember it:

| Field(s) | On change |
|---|---|
| `weekday`, `startTime`, `durationMin`, `capacity`, `coachId` | **regenerate** from `applyFrom` (may be refused) |
| `name` | **update future sessions' names in place** (decision 9); never refused |
| `imagePath` | nothing — the image is read from the type at render time, not snapshotted |
| `active` | unchanged behaviour (decision 10): `false` stops future generation, existing sessions stay |

### 5.2 The latent defect this makes live: `regenerateFrom` deletes what it will not refill

`docs/BACKLOG.md:774` names this and says it becomes live "the moment a schedule-edit flow wires it
in, which is **M14b**". Confirmed by reading, not inherited:

- the **delete** is `findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, fromInstant)` — unbounded
  backwards, so a `from` in the past deletes past sessions;
- the **recreate** floors at today (`start = notBefore.isBefore(today) ? today : notBefore`) and skips
  anything already started (`if (startAt.isBefore(Instant.now())) continue`).

So sessions between a past `from` and today are deleted and **never refilled**. Worse, `session_item`
cascades from `class_sessions` and `wod_score.session_item_id` cascades from `session_item`, so
deleting a past session **destroys every score logged against it** — the same family as D-1, and
`M33` names performance history as the real switching cost for a CrossFit box.

Its blocking check is also booking-only, so a past session carrying scores but no live booking is
unprotected.

**Fix — one guard, where every caller routes through:** clamp the delete range to sessions that have
not started, i.e. `startAt >= max(fromInstant, now)`. This makes the delete range and the recreate
range identical, which is the property that was missing, and it fixes both halves at once:

- a past `from` can no longer delete anything, so nothing goes unrefilled;
- a scored session has by definition already started, so scores become unreachable by this path
  without a separate score check.

### 5.3 Wiring the edit, and reporting a refusal

`PatchTemplateRequest` gains an optional `applyFrom` (a `LocalDate`, defaulting to today). It is a
**body field on the existing route**, so no route is added and **`AuthzConformanceTest` needs no
edit** — `PATCH /api/box/class-templates/{id}` is already registered `COACH`. An edit to that file in
this milestone is a signal that scope has leaked.

`regenerateFrom` already refuses with `409 RANGE_HAS_BOOKINGS: 2026-09-08, 2026-09-15`, carrying the
blocking dates precisely so the screen can tell the admin what to clear.

**The modal reports it and offers the way through:**

> **3 classes between 8 and 15 Sep have bookings.**
> Changing the schedule would cancel them, so we haven't.
> `[ Apply from 16 Sep ]`

One tap re-sends the patch with `applyFrom` = the day after the last blocking date. The admin keeps
the earlier, already-booked classes at the old time and the new schedule starts after them, which is
what a gym owner actually wants.

---

## 6. Explicitly not in this milestone

| Item | Owner |
|---|---|
| The builder, block authoring, swipe reorder | M14c-a |
| Applying a capacity change in place instead of regenerating (decision 8) | backlog |
| Per-limit 409 reason and `CANCEL_LIMIT_REACHED` copy on booking | M17 |
| The `entitlement` / `weeklyClassLimit` wire shim | M16b |
| The admin shell's 401px horizontal overflow at 320/360/393 | backlog, pre-existing |
| `runner.spec.ts:43`, the TV SSE lost-push bug | M37 |
| Box settings UI for `cancel_cutoff_min` / `booking_horizon_weeks` | M15b |

---

## 7. Verification

**Standing gates, all of which must be green before merge:**

- Backend suite green, from **749** passing.
- Karma green, from **615** passing.
- Production build with **zero** warnings.
- `AuthzConformanceTest` passes **with no edit to it** — this milestone adds no route.
- The `ui/` cleanliness greps return zero: no `@Input()`, `@Output()`, `ChangeDetectionStrategy.Eager`,
  raw hex or raw px type sizes in `frontend/src/app/ui/`.
- No raw hex outside `_tokens.scss`.
- Every string on the rebuilt admin screen and the new component is i18n-marked.
- axe-core clean on the gallery and the rebuilt screen.
- Visual baselines regenerated via **`e2e/visual.sh` in the Linux container**, and verified against the
  committed files.

**Tests this milestone specifically owes:**

1. **`regenerateFrom` with a past `from` deletes nothing before now.** The §5.2 fix, and the test the
   backlog entry has been waiting for. Assert both halves: past sessions survive, and a score logged
   against a past session survives.
2. **`PATCH` with a changed `startTime` leaves no session at the old time.** The §5.1 defect, stated
   as the behaviour rather than the implementation.
3. **`PATCH` on a slot with a booked session in range is refused, names the blocking dates, and
   changes nothing** — neither the slot's fields nor any session.
4. **`PATCH` with `applyFrom` past the blocking dates succeeds**, leaving the earlier booked sessions
   at the old time.
5. **A rename updates future sessions in place and is never refused** — decision 9. Assert it
   succeeds on a slot whose sessions are booked (the case a regeneration would refuse), that future
   sessions carry the new name, and that a session which has already started keeps the old one.
6. Happy + auth-denied + cross-tenant-denied on the patch path, per the standing rule.
7. **e2e: the strip's dot jump reaches a class in one tap**, which is the complaint stated as a test.
8. **e2e on the rebuilt admin screen.** A screen is not verified until e2e runs on it — Karma cannot
   see a dead submit binding, and this screen is being moved off `(ngSubmit)`, which is exactly the
   failure e2e caught on login.

**The impeccable routine, per screen, not per milestone:**

```
shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH
```

Applies to `admin/schedule.page.ts` (a rebuild) and to `bh-week-calendar` plus its gallery section.
`coach/classes.page.ts` gets it too — the strip changes how the screen is navigated, not just what it
imports. The two swap-only screens do not get their own cycle.

`interaction-design` applies to `bh-week-calendar` (a new component).
`harden` applies to the admin screen (it renders real data; a long gym name has pushed a page into
horizontal scroll at 200% zoom before).

**Both audit and critique run with Claude in Chrome connected.** A source-only pass is provisional. The
browser cannot render below ~500px, so **320/360/393 verification goes through Playwright**, not the
extension.
