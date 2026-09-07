# M14c-a — the builder

**Date:** 2026-09-07 · **Status:** spec, approved · **Roadmap row:** 10
**Source of scope:** `docs/superpowers/specs/2026-08-09-m14-coach-tour.md` decisions 1–4, 7, 8, 10
**Supersedes for this milestone:** nothing. Decision 9 (timer auto-arm) belongs to **M34**.

One page for checking a WOD, creating one, and building a class. Blocks of blocks at two levels, the
presets UI over the segment sequence, drag reorder replacing the arrows, a replacement for the scored
checkbox, and team WOD authoring. Fixes the two defects M14b filed for this milestone.

---

## 1. The finding that shapes this milestone

**M14a shipped the model and left it unreachable.** Verified against the code, not inferred:

| Built in M14a | Reachable today |
|---|---|
| `WodJson.Block.blocks` — two-level nesting, cap enforced by `WodJsonValidator` | **no** — no wire field, no UI |
| `WodJson.Timing{rounds, segments[WORK\|REST]}` | **no** — `timing_json` is written empty on every create and read by nobody |
| `Macros.ALL` = WARMUP/STRENGTH/GYMNASTIC/WORKOUT | **no** — the wire still sends legacy `wodType` |
| `TimingPresets.ALL` = FOR_TIME/AMRAP/EMOM/**TABATA**/INTERVAL | **no** — TABATA has never been expressible |
| `wod.library`, `WodService.attachToSession` | **no** — `grep` finds references only in `WodLibraryCopyTest` |
| `WodService.promoteToLibrary` | **no** — and stronger than the row above: **zero** callers and **zero** tests, verified at `7481c34`. Deleted in Task 4 rather than migrated. |

So M14c-a is mostly **wiring what exists**, plus one page, plus team (which genuinely does not exist
anywhere in the backend). That is why its migration is small.

**D-1 is already fixed and must not be re-fixed.** `docs/BACKLOG.md` still carries the open question
*"editing a class's programming DELETES every score logged against it — fix now as a defect, or fold
into M14c-a?"*. M39 answered it: `SessionItemController.replace` now reconciles against the existing
rows, parks survivors at negative sort orders to dodge the unique constraint, deletes only genuinely
dropped pieces, and refuses with `409` both to remove a scored piece and to rebind a scored piece to a
different wod. This milestone **closes that backlog entry as done** rather than touching the logic.

---

## 2. Decisions taken at the screen

The tour recorded six questions to be *asked at the screen, never guessed* (tour §4). Four were asked
and answered on 2026-09-07; two were already answered elsewhere.

| # | Question | Decision |
|---|---|---|
| 1 | Page shape at 360px | **Stack + pushed editor.** The class stack is one route; tapping a piece pushes a full-page editor at its own route; the same editor component serves a standalone WOD. This is the tour's own *"split into two pages, build a class and build a block, so a single block can be made and then attached"*. |
| 2 | Mobile reorder gesture and scope | **Long-press drag, both levels.** Pieces in the class and blocks inside a piece. Lines inside a block get a grip handle instead — a drag on a text input fights the caret. |
| 3 | The scored-checkbox replacement | **One chip row, no boolean:** Not scored · Time · Rounds+reps · Load · Completion. Picking anything but "Not scored" sets `scoreable` and the type in one tap. **"Completion" (scored, done/not-done) stays distinct from "Not scored" (no result at all)** — they are different rows in the data and must read differently in the UI. |
| 4 | Team WOD depth | **Authoring + team scoring.** "Team of N" and how the work is shared, on the piece; one result logged per team with members picked at score time. Roster planning stays out — that is "Heats/teams", Project 2. |
| 5 | Team scoring reach | **Model + API + a picker in the existing `bh-score-form`.** Authoring a "Team of 2" that can never be scored would be *absent*, which `2026-08-22-v1-0-pilot-program.md` forbids; built-but-idle is the permitted shape, absent is not. |
| 6 | Movement field | **A picker sheet, not the native `<datalist>`.** User-stated: *"we have to avoid the basic combo and be mobile friendly."* |
| 8 | Scaling options per exercise | **A line carries a LIST of scales, each shaped like the line itself** — movement + reps + load. "6 muscle-ups → 12 pull-ups or 20 ring rows". User-asked 2026-09-07. §5A. |
| 9 | Notify when a coach posts the programming | **Fire `PROGRAMMING_PUBLISHED`, on by default, to the athletes booked on that session.** User-asked 2026-09-07: *"fire a notification when the coach attach the class exercise to the class"*, and *"only for the class that im booked"*. §5B. |
| 7 | Admin access to the builder | **Coach-only route now, admin entry point filed to M15b.** `BOX_ADMIN` already passes the staff guard, so an admin who reaches the URL can use it. Where an admin *finds* it is an IA decision belonging with the admin surfaces. |

Two mechanisms were chosen by the orchestrator rather than asked, and are called out as reversible in
§9: **`team_id` on `wod_score`** rather than a team-score table, and **`source_wod_id`** as the
mechanism behind "re-saving updates in place".

---

## 3. Backend — reach the axes, additively

### 3.1 The wire

`WodController.WodDto` gains `macro`, `timingPreset`, `timing`, `library`, `teamSize`, `teamShare`,
and **keeps `wodType`**, still derived through `WodTypeWire.toWodType`.

`CreateWodRequest` / `PatchWodRequest` accept `macro`, `timingPreset`, `timing` directly.
**Precedence: if `macro` is present, use `macro` + `timingPreset` verbatim; otherwise derive both from
`wodType` exactly as today.** `wodType` remains accepted and is never removed in this milestone.

`timing_json` starts being persisted from the request instead of always being written empty.

### 3.2 Why this closes the CIRCUIT/CUSTOM/SKILL loss

`docs/BACKLOG.md`: *"A pre-M14a `CIRCUIT`, `CUSTOM` or `SKILL` wod reopens with a blank type select…
M14c rebuilds that select against the real axes and the loss disappears with it."*

The loss is `WodTypeWire`'s deliberate lossy round-trip: `CIRCUIT`/`CUSTOM` both compose back as
`WORKOUT`, `SKILL` as `GYMNASTIC`, none of which are options in the legacy `<select>`. The rebuilt
editor **never sends or reads `wodType`** — it reads `macro`/`timingPreset` and writes them back — so
nothing round-trips through the lossy map and the select always has a matching option. The fix is the
absence of a call, which makes it easy to reintroduce; §7 pins it with a test.

### 3.3 What deliberately does NOT change

Seven files still consume `wodType` and stay legacy this milestone: `coach/runner.page.ts`,
`athlete/wod.page.ts`, `programming/wod-library.page.ts`, `programming/types.page.ts`,
`programming/programming.service.ts` (the constant), `display/TvStateService.java`, and the two specs.
They belong to M14c-b, M17b and M34. Additive is what lets this milestone rebuild two screens without
touching seven others.

`AuthzConformanceTest`'s request-body map sends `{"title":"W","wodType":"FOR_TIME",…}` to
`POST /api/box/wods`. The additive wire keeps that entry valid **unchanged** — no edit to the sweep is
needed for it, and none is permitted beyond registering genuinely new routes.

---

## 4. Backend — the unbounded-`wod` growth fix, at its root

`docs/BACKLOG.md` → M14 Class model & schedule: *"Instance-builder save creates new `wod` rows on
every edited re-save… the library grows unboundedly."*

The fix is three parts, and only the third needs a migration.

**1. The library list must filter.** `GET /api/box/wods` today calls
`WodRepository.findByOrderByUpdatedAtDesc()` and returns **every** `wod` row. Nothing creates a
non-library row today, so this is latent — but the moment part 2 starts creating per-class copies, an
unfiltered list floods the library with one entry per class. This half is not named in the backlog
entry and is the reason the copy mechanism alone would not have been enough.

Add `findByLibraryTrueOrderByUpdatedAtDesc()` and
`findByLibraryTrueAndTitleContainingIgnoreCaseOrderByUpdatedAtDesc(String)`. Derived queries are
correct here: `Wod` is `@TenantId`, and box-scoped filtering is exactly what this read wants. No
native SQL, no `runAsRoot`.

**2. Attach copies; edits update the copy in place.** `PUT /sessions/{id}/items` routes a piece picked
from the library through `WodService.attachToSession`, which already copies with `library = false`, so
the class owns its content and editing the library entry later never rewrites what a class that
already ran actually did. A piece's subsequent edits **PATCH that copy**. After this change **no save
path mints a `wod` row on re-save** — the growth is gone at the root, not deduped after the fact.

**3. "Save to library" needs provenance.** Tour decision 4: *"A block is local to its class unless
explicitly saved to the library. Default off. Re-saving an edited local block updates in place."*

`WodService.promoteToLibrary` cannot serve this: it flips the class's own copy into the library, which
re-couples the class to the shared row and undoes part 2. Instead, `wod` gains **`source_wod_id uuid
null`**:

- "Save to library" **off** (default) — nothing happens beyond the copy. This is the common case.
- "Save to library" **on**, `source_wod_id` set — PATCH the library row it points at. *Updates in place.*
- "Save to library" **on**, `source_wod_id` null — create one library row from the copy, record its id
  in the copy's `source_wod_id`.

A subsequent re-save therefore takes the second branch, which is what "updates in place" means.
`promoteToLibrary` becomes unused by production code and is **deleted** along with its test coverage
being moved onto the new path, rather than left as a second, divergent mechanism.

---

## 5. Backend — team

### 5.1 Schema (same migration)

```
wod.team_size   int  not null default 1
wod.team_share  text null            -- TOGETHER | SPLIT | RELAY, null iff team_size = 1
wod_score.team_id    uuid null
wod_score.team_name  text null
```

### 5.2 A team result is N rows sharing an id, not a team-score table

Three teams of two logging Fran writes six `wod_score` rows: each carries the same result and the same
`team_id`, each carries its own `membership_id`.

Why this shape:

- **Every existing read keeps working with zero changes.** `LeaderboardController`,
  `HistoryController`, `PerformanceQueries` and the analytics work all key on `membership_id`. A
  separate team-score table would force every one of them to union two differently-shaped sources.
- **The existing `unique (box_id, session_item_id, membership_id)` still holds** — one athlete, one
  result per piece — and needs no migration.
- **The athlete gets it in their own history**, which is what they want: *"I did Fran with Marco in
  8:41"*, not a result that lives on a team they have to go find.

`team_name` is optional and free text; when absent the UI names the team by its members.

### 5.3 Endpoint

`POST /api/box/sessions/items/{itemId}/score/team` — body carries the member ids and one result.
Writes all N rows in **one transaction** with a generated `team_id`.

Authz: **the caller must be one of the named members, or staff.** Registered in
`AuthzConformanceTest.MIN_ROLE` as `ATHLETE` with the per-row membership check noted alongside, the
same shape `GET /api/box/receipts/{paymentId}` already uses. An athlete may not log a result for a
team they are not in.

Validation: the member count must equal the piece's `team_size`; every membership must belong to the
caller's box (`@TenantId` gives this, and a foreign id therefore 404s rather than leaking).

### 5.4 Migration

**`V33__builder.sql`** — `wod.source_wod_id`, `wod.team_size`, `wod.team_share`, `wod_score.team_id`,
`wod_score.team_name`. All additive, all nullable or defaulted. Never edit an applied migration.

---

## 5A. Backend — scaling options per exercise

**User-asked, 2026-09-07:** *"we need also a scaling option to every exercise (multiple also), for
example exercise is 6 muscle up and we can scale it with 12 pull ups or 20 ring row."*

### 5A.1 A scale has the same shape as the line it scales

`WodJson.Line` carries a single free-text `String scaling` today. It becomes a **list**, and each
entry is shaped like the line itself, so a scale gets the same movement picker and a later
leaderboard can tell *scaled to ring rows* from *scaled to jumping pull-ups*:

```java
public record Scale(String text, UUID movementId, String reps, String load) {}
public record Line(String text, UUID movementId, String reps, String load,
                   String scaling, List<Scale> scales) {}
```

### 5A.2 No migration — normalise on read instead

`blocks_json` is JSONB, so widening the record needs no DDL. Rewriting every historical `scaling`
string would mean a `jsonb_set` walk through two levels of block nesting for a field that, verified
before planning, **has almost no reader**: the record, the TS interface, and
`wod-builder.page.ts` — which this milestone deletes.

So `WodService.deserialize` normalises: a line with a non-blank `scaling` and no `scales` is read
as `scales = [ Scale(scaling, null, null, null) ]` with `scaling` cleared. Writes always emit
`scales` and never `scaling`. **One meaning at every API boundary, a legacy reader behind it, and
the row heals itself the next time it is saved.** This is the same move M14a made for the block
depth cap — behaviour in the validator rather than a rewrite of stored JSON.

`scaling` stays on the record as the legacy input only, and is **never** returned populated.

### 5A.3 Validation

`WodJsonValidator` gains: a scale must carry a non-blank `text` **or** a `movementId` (an entry that
says nothing is a UI slip, not a prescription), and **at most 6 scales per line**. The cap exists
because `blocks_json` is an unbounded user-controlled document and this milestone is closing an
unbounded-growth bug, not opening a second one. Six is generous — a box offering seven alternatives
to one movement has a programming problem, not a software one.

---

## 5B. `PROGRAMMING_PUBLISHED` — the coach has posted the workout

**User-asked, 2026-09-07:** *"we need to fire a notification when the coach attach the class exercise
to the class: for example 'The coach has uploaded the wod/exercises'"*, and on the audience,
*"only for the class that im booked"*.

### 5B.1 The event already exists in the registry

`docs/NOTIFICATIONS.md` §4.4 already carries the row: trigger `programming_status → PUBLISHED`,
recipients *athletes booked on it*, channel *feed*, owner **"later"**. **This milestone is taking
ownership of a registered event, not inventing one** — which is what §7 of the registry requires
before any code is written.

M29b built the entire mechanism. `NotificationType` is the registry in code, and its own comment is
explicit: *"adding an event is a row in `docs/NOTIFICATIONS.md` plus a constant here, never a
migration."* So this costs **one enum constant and one call site.**

### 5B.2 The one conflict, and how it resolves

The registry declares the event **off by default**, reasoning: *"a box that publishes a week at a
time would fire this a dozen times in a minute."*

That worry was written against a bulk-publish path **that does not exist**: the builder publishes
**one session at a time**, from one screen, with one button. Off-by-default would also mean almost
no athlete ever receives it, which is not what was asked for.

**Resolution — the registry row is amended, with the reasoning recorded rather than silently
flipped:** `defaultOn = true`, `mandatory = false` (an athlete can turn it off; it is a training
event, and §5.3 makes training events opt-out rather than mandatory).

### 5B.3 The declaration

```java
PROGRAMMING_PUBLISHED ("clipboard-list", true, true, false),
//                      icon             feed  default  mandatory
```

`clipboard-list` is already in `ICON_NAMES`; no icon is added.

- **link** — `/athlete/class/{sessionId}`, joining the existing session-scoped arm of
  `NotificationType.link`.
- **dedupeKey** — `sessionId`. A coach who fixes a typo and hits *Save & republish* must not
  re-notify the roster. This is the mechanism `CLASS_STARTING_SOON` already uses, not a new one.
- **audience** — the **booked** roster of that session (`BOOKED` or `CHECKED_IN`), resolved once at
  emit and stored, per §5.2's frozen-audience rule.

### 5B.4 Two rules that are easy to get wrong here

1. **`NotificationService.emitAll` is `@Transactional(propagation = MANDATORY)`** — it must run
   inside a caller's transaction, because an in-app row is *persistence* and belongs inside the
   transaction that caused it (registry §5.1). **`SessionItemController.publish` carries no
   `@Transactional` today**, so it gains one. Without it the call throws at runtime rather than
   silently doing nothing — but only on the path a coach actually uses.
2. **A drop-in visitor has a null `membershipId`** (M22), and `notification.membership_id` is NOT
   NULL. `emitAll` already filters nulls centrally, precisely so every booking-derived fan-out does
   not have to remember. Follow `ClassReminderScheduler.sweepBox` — do not re-implement the filter
   at this call site.

### 5B.5 It fires on the transition, not on every save

Only when `programming_status` actually moves to `PUBLISHED` from something else. A publish of an
already-published session emits nothing, and `dedupeKey` is the belt to that braces.

---

## 6. Frontend — two routes, one editor

| Route | Screen | Replaces |
|---|---|---|
| `coach/classes/:id/build` | class stack | `coach/instance-builder.page.ts` — **deleted** |
| `coach/classes/:id/build/piece/:index` | piece editor | — |
| `coach/wods/new`, `coach/wods/:id` | the **same** piece editor, standalone mode | `programming/wod-builder.page.ts` — **deleted** |

**The class-stack path is the one that already exists**, not a new one: `classes.page.ts:47` links to
it as `[route]="['/coach/classes', s.id, 'build']"`, and it already carries
`canDeactivate: [unsavedGuard]`. Keeping it means no dead link and a smaller diff; the piece editor
is a child route beneath it.

### 6.1 The class stack

A single scrolling column of piece cards. Keeps the skeleton pre-seed — the class type's
`TemplatePiece` list seeds an empty instance, which is the model the user validated on the tour
(*"the standard schedule every week, the class is empty of exercise, then we can build it"*). Each
card shows position, macro + timing preset, title, and how it is scored. Long-press drag reorders.
Save draft / Save and publish at the bottom.

### 6.2 The piece editor

Title · macro chips · timing preset chips · the segment list · blocks of blocks · the score chip row ·
the team row · "Save to library" (default off).

**Timing presets seed, they never constrain** (tour decision 8). Picking a preset fills the segment
list; the coach then edits segments freely and **the preset name survives** for filtering, analytics
and the board's eyebrow. This is what makes the user's *"every 30 second squat, then 15 second rest
then 30 second burpees, but maybe is a tabata"* expressible:

```
EMOM 12    ->  12 x [ 60s work ]
Tabata     ->   8 x [ 20s work, 10s rest ]
the user's ->   N x [ 30s work "squat", 15s rest, 30s work "burpees" ]
AMRAP 20   ->   1 x [ 20:00 work ]
For time   ->   1 x [ cap ]
```

**Each line carries its scaling options** (§5A): under the prescribed movement, a list of
alternatives, each an ordinary line row reusing the same movement pick sheet, with *+ scaling
option* beneath. Empty by default — most lines have none — and capped at six.

**Blocks are exactly two levels** and the UI must not offer a third — `WodJsonValidator` rejects it
with `BLOCK_DEPTH`, and an affordance that produces a 400 is a defect, not a guard.

### 6.3 Standalone mode

The same component, with no session in the route: it edits a library `wod` directly, hides the
"Save to library" control (a standalone WOD *is* a library row), and returns to the library on save.
"Checking a WOD, creating one, and building a class" is therefore literally one editor, which is tour
decision 3.

### 6.4 Binding frontend law both screens inherit

- **The M13d form contract.** `(ngSubmit)` dies with `FormsModule`: native `<form (submit)="…"
  novalidate>` with `preventDefault()`, `[(value)]` against signals, `bh-field`/`bh-select` are not
  `ControlValueAccessor`s. This is the contract that shipped a password into the URL when it was
  missed.
- **A disabled button guards one path, never the action.** The guard lives in the handler; Enter
  submits regardless of any `[disabled]`.
- **i18n-marked**, locale-aware dates and numbers, no hardcoded user-facing string, no hand-written `€`.
- **Mobile first at 360px**, `--tap` minimums, primary action full-width and tall.
- **The screen's volt budget is already spent by the shell's box switcher.** The builder is a plumbing
  screen, not a hero: its one primary action is `bh-button variant="strong"`, and no chip, row or
  badge on it may fill volt.
- No `ChangeDetectionStrategy.Eager` on the new screens.
- `duplicate` goes — the tour asked for it explicitly (*"Remove the duplicate function"*). The
  endpoint stays until M14c-b retires the library page that is its other caller.

### 6.5 The chip row exposes a live defect, and must fix it

The five-option chip row offers **Completion** (scored; the result is done-or-not) as distinct from
**Not scored** (no result at all). Verified against the code, that distinction is currently broken:

- `performance/score-form.component.ts` **does** have a completion branch — the `@default` case of its
  `@switch (scoreType)`, rendering *"Mark today's work complete."*
- Its only consumer, `athlete/wod.page.ts`, gates it out at **two** places:
  line 50 (`@if (i.scoreable && i.scoreType !== 'NONE')`, the log button) and line 179 (the same
  condition deciding whether the piece reads as *"· scored"*).

So `scoreable = true, scoreType = NONE` is an authorable state today with **no way to log it**, and
the form branch that would handle it is unreachable dead code.

**The fix is the guard, not the chip row**: both conditions become `i.scoreable`. Two lines, on a
screen M17b will later rebuild — taken here as a defect fix rather than a rebuild, because the
alternative is shipping a chip option that silently does nothing. Per the root-cause rule, both
call sites change together; patching only the log button would leave the label still lying.

The score chip row itself is `bh-segmented` with `wrap` and `tone="bone"` (§7.2), not a new component.

### 6.6 The athlete's reader renders one level, and this milestone gives it two

Same class of gap, found the same way. `athlete/wod.page.ts:39-46` renders the structured blocks:

```
@for (blk of i.wod.blocks.blocks)  ->  @for (l of blk.lines)
```

It renders `blk.lines` and **never `blk.blocks`** — one level. Two-level nesting has existed since
M14a, but nothing could author it, so the gap was invisible. The moment this milestone's editor can
create a macro block holding sub-blocks, **the athlete sees a labelled block with nothing in it**,
and a line's scaling options are invisible for exactly the same reason.

Authoring something no one can read is the *absent* the v1.0 rule forbids, so the reader is widened
here: recurse one level, and render a line's `scales` beneath it. **One level of recursion, not
arbitrary depth** — the model is capped at two and the renderer should say so.

This is a contained change to a screen **M17b will rebuild**, taken here for the same reason §6.5's
guard fix is: the alternative is shipping an editor whose output cannot be seen. M17b still owns the
screen's design; this owns its correctness.

---

## 7. Components — one new, not three

The inventory was checked before designing: `alert auth-layout avatar benchmark-board button
data-table dock empty field icon panel pill search-bar segmented select sheet shell-header switch
timer week-calendar wordmark`.

### 7.1 `bh-sortable-list` — new, in `ui/`

Long-press pointer drag, used at both levels.

**Hand-rolled on Pointer Events; no new dependency.** `@angular/cdk` is not installed, and it would
not supply the keyboard half anyway — so adding it would buy one of the two halves at the cost of a
dependency.

**Keyboard reorder is required, not optional.** Drag alone fails WCAG 2.1.1. Grab with Space, move
with arrows, drop with Space, Escape cancels and restores the original position. Every move announces
through a live region.

Owes the full seven-states contract, a dev-gallery section that declares the states it cannot have,
axe, and visual baselines. `ui/` law: signal inputs only, no raw px type sizes, no raw hex.

### 7.2 `bh-segmented` — extended, not duplicated

`bh-segmented` is already the chip-group primitive: `role="radiogroup"`, roving tabindex, arrow keys,
Home/End, and a focus ring that inverts to `--focus-inv` on the selected fill. Re-implementing it as a
`bh-chip-group` would be the duplication the design law names as a bug.

Two new inputs, **both defaulted to today's behaviour** so neither existing consumer
(`dev-gallery.page.ts`, `performance/score-form.component.ts`) changes on account of them —
`score-form` changes in this milestone for §5.3 and §6.5, but its `bh-segmented` usage does not:

- **`wrap`** (default `false`) — five score options do not fit one `inline-flex` line at 360px.
- **`tone`** (default `'volt'`, new value `'bone'`) — a volt-filled chip would be a second volt
  element on a screen whose budget the shell already spent. `'bone'` fills `--bone` with `--on-bone`
  ink: 15.9:1 against the card, and not volt. This is the precedent `bh-button variant="strong"`
  already set for exactly this situation.

The gallery's existing segmented section gains the new states; it does not get a second section.

### 7.3 `pick-sheet` — feature-local, in `features/programming/`

`bh-sheet` + `bh-search-bar` + full-width rows + an optional *"use what I typed as free text"* last
row, so a movement not in the library is never a dead end.

Two consumers, each mapping its domain object to `{id, primary, secondary}`: the **movement picker**
(name, plus category · modality) and the **library picker** (title, plus macro · timing preset).

Kept out of `ui/` on purpose: it composes existing components for one feature area, and `ui/`
membership carries the gallery-and-baselines contract. Promote it if a third consumer appears.

**No `bh-chip-group`. No `bh-pick-sheet` in `ui/`. No new dependency.**

---

## 8. Verification

### 8.1 Backend

- Every new or changed box-scoped endpoint gets **happy + auth-denied + cross-tenant-denied**.
- `GET /api/box/wods` **excludes** non-library copies — asserted with a copy present, which is the
  half of the growth fix that is easiest to forget.
- **The growth bug, asserted directly:** edit a piece and re-save, then assert the `wod` row count is
  **unchanged**. This test is the milestone's headline claim; it must fail if part 2 regresses.
- "Save to library" twice updates one library row rather than creating two (`source_wod_id`).
- A team score writes N rows sharing one `team_id`, each with its own `membership_id`; a non-member
  athlete is refused.
- **The type loss, asserted:** a wod created with `macro=WORKOUT, timingPreset=null` reads back
  unchanged — no round-trip through `WodTypeWire`.
- **Scales round-trip**, a legacy `scaling` string normalises to a one-entry `scales` list, a
  seventh scale is refused, and an empty scale is refused.
- **The athlete reader shows a nested block's lines and a line's scaling options** — asserted on
  `athlete/wod.page`, because this milestone is the first that can author either.
- **`PROGRAMMING_PUBLISHED`** fires once to the booked roster on the DRAFT→PUBLISHED transition,
  emits nothing on republish, skips a visitor booking with a null membership, and writes its row
  **inside** the publishing transaction.
- New routes registered in `AuthzConformanceTest.MIN_ROLE` with their real intent. **Registering a
  route (and seeding a real id in `pathIds`) is the only permitted edit to that file**, and the
  orchestrator audits it.

### 8.2 Frontend

- Karma for both screens and `bh-sortable-list`, including the keyboard reorder path.
- **e2e is mandatory, not conditional.** Karma cannot see a dead submit binding — a spec that calls
  `submit()` tests the handler, never the wiring — and this milestone rewrites two forms. Run on a
  `down -v` stack.
- **Rebuild the frontend image and grep the served chunks for the new testids before trusting any
  browser or e2e result.** The image does not rebuild itself, and specs drifting against a stale
  bundle passed silently in M14b.
- Standing greps stay at zero: `runAsRoot` in controllers, `ui/` decorators, `ngSubmit`/`FormsModule`
  on rebuilt screens.
- axe and visual baselines on the gallery.

### 8.3 The impeccable routine runs TWICE

The class stack and the piece editor are **two screens**, so it is two full passes of
`shape -> build -> audit (>=16/20) -> critique (>=32/40) -> fix every P0/P1 -> re-score BOTH`, not one
pass over the milestone at the end.

Both run with Claude in Chrome connected; a source-only pass is provisional and must say so. If the
browser is unavailable, **stop and ask** rather than scoring anyway. **A score measured with a P0 or
P1 still open is not the screen's score** — M14b was merged on an uncounted 33/40 and needed a
follow-up branch.

Conditional passes that apply here: **`harden`** (both screens render real data — a long gym name
already pushed a page into horizontal scroll at 200% zoom), and **`interaction-design`** for
`bh-sortable-list`. `bolder`/`delight`/`overdrive`/`distill` are never routine and do not apply: the
builder is plumbing, not a hero screen.

---

## 9. Reversible mechanisms

Two choices were made by the orchestrator rather than asked, and are recorded here so a later
milestone can revisit them knowing why:

- **`team_id` on `wod_score` rather than a team-score table** — §5.2. Reversible while the only writer
  is the team endpoint; it stops being reversible once a report reads `team_id` directly.
- **`source_wod_id` as the "updates in place" mechanism** — §4.3. The alternative was
  `promoteToLibrary`, which re-couples the class to the shared row and undoes the copy-on-attach fix.

---

## 10. Out of scope, filed rather than dropped

| Item | Owner | Why not here |
|---|---|---|
| Timer auto-arms from the programmed piece (tour decision 9) | **M34** | The roadmap assigns it there explicitly; `ClassTimer.spec_json` is free-form, so no migration is blocked by waiting. |
| Admin entry point to the builder | **M15b** | An IA decision about the admin shell, not a builder change. `BOX_ADMIN` can already use the coach route. |
| WOD library page, benchmarks deletion, types page moving to admin | **M14c-b / M15b** | Tour decisions 5 and 6, scoped to the next milestone. |
| Roster team-splitting, heats | **Project 2** | Named as out of scope when team depth was decided. |
| The seven remaining `wodType` consumers | **M14c-b / M17b / M34** | Additive wire is what lets this milestone leave them alone. |
| `POST /api/box/wods/{id}/duplicate` endpoint | **M14c-b** | The builder stops calling it; the library page is its other caller. |

## 11. Backlog entries this milestone closes

- **Instance-builder save creates new `wod` rows on every edited re-save** (→ M14 Class model &
  schedule) — §4.
- **A pre-M14a `CIRCUIT`, `CUSTOM` or `SKILL` wod reopens with a blank type select** — §3.2.
- **"Editing a class's programming DELETES every score logged against it — fix now or fold into
  M14c-a?"** — closed as **already fixed by M39**, §1. The entry is answered, not actioned.

Found while writing this spec, fixed here rather than filed:

- **`bh-score-form`'s completion branch is unreachable** — `athlete/wod.page.ts:50` and `:179` both
  gate on `scoreType !== 'NONE'`, so a piece authored as scored-by-completion can never be logged.
  §6.5.
- **The athlete's block renderer is one level deep** — `athlete/wod.page.ts:39-46` never renders
  `blk.blocks`, so a nested block would show as empty the moment the editor can author one. §6.6.
