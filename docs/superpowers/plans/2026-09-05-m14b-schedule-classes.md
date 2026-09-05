# M14b — Schedule & Classes Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `bh-day-pager` with a swipeable week strip carrying availability dots, rebuild the admin schedule page on it, add the admin class-detail modal, and fix the two schedule-regeneration defects that wiring slot editing exposes.

**Architecture:** One new `bh-*` component (`bh-week-calendar`) owns the strip and projects each screen's day list as content. Availability dots are a `computed()` over data the screens already fetch — no new read endpoint. On the backend, slot editing routes through the existing `SlotRegenerationService` rather than the additive `SessionGenerator`, which requires fixing that service's delete range first. No new routes, no migration.

**Tech Stack:** Angular 22 (signal inputs, `model()`, standalone components), Spring Boot 3.5 / Java 21, Postgres 16, Karma, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-m14b-schedule-classes-design.md` — executors read both.

## Global Constraints

- **Tokens only.** No hardcoded color / font / radius / spacing. A raw hex outside `frontend/src/styles/_tokens.scss` is a bug.
- **`frontend/src/app/ui/` is clean:** signal inputs only (`input()`, `model()`, `output()`), no `@Input()`, no `@Output()`, no `ChangeDetectionStrategy.Eager`, no raw hex, no raw px type sizes.
- **Volt is spent.** The shell's box switcher is the one volt element; nothing in this milestone adds another. Dots and selection markers are `--bone` / `--faint`.
- **Forms:** `<form (submit)="submit($event)" novalidate>` with `event.preventDefault()`. **Never** `(ngSubmit)`, never `FormsModule`. `bh-field`/`bh-select` are not `ControlValueAccessor`s — bind `[(value)]`.
- **A disabled button guards one path, never the action.** Put the guard in the handler too.
- **i18n:** every user-facing string carries an `i18n` marker with an explicit `@@id`. No new hardcoded string, no hand-written `€`. Dates/numbers go through locale-aware formatting.
- **Mobile first at 360px**, verified at 320. A native `<select>` is banned for anything richer than a plain short label — use `bh-sheet` with real rows.
- **`--tap` minimum on every interactive target.**
- **No new backend route.** `AuthzConformanceTest` must pass **with no edit to it**; an edit signals scope leak.
- **Java builds:** `JAVA_HOME=/opt/homebrew/opt/openjdk@21`. There is no `./mvnw`.
- **Frontend commands:** always `env -u NODE_OPTIONS` (NODE_OPTIONS is poisoned in this environment).
- **Never chain a grep gate with `&&`** — a grep that correctly finds nothing exits 1 and aborts the chain. Run each gate as its own command and print the count.
- **Baselines:** `e2e/visual.sh` (Linux container), never Playwright locally.

---

## File Structure

**Created:**
- `frontend/src/app/ui/week-calendar.component.ts` — the strip: week derivation, dots, swipe, keyboard.
- `frontend/src/app/ui/week-calendar.component.spec.ts` — Karma.
- `frontend/src/app/features/admin/class-detail.sheet.ts` — the admin class-detail modal.
- `e2e/tests/schedule.spec.ts` — e2e for the strip and the rebuilt admin screen.

**Deleted:**
- `frontend/src/app/ui/day-pager.component.ts` and its `.spec.ts`.
- `e2e/tests/visual.spec.ts-snapshots/day-pager-{phone,tablet,desktop}.png`.

**Modified:**
- `backend/.../box/SlotRegenerationService.java` — the delete-range guard.
- `backend/.../box/ClassTemplateController.java` — route scheduling edits to regeneration; rename in place; `applyFrom`.
- `backend/.../box/ClassSessionRepository.java` — the rename bulk update.
- `backend/src/test/java/com/boxhub/box/SlotRegenerationTest.java`, `ClassTemplateApiTest.java` — new tests.
- `frontend/.../features/coach/classes.page.ts`, `features/athlete/book.page.ts`, `features/messaging/announcements.page.ts` — adopt the component.
- `frontend/.../features/admin/schedule.page.ts` — rebuilt.
- `frontend/.../features/booking/booking.service.ts` — `applyFrom` on the patch type.
- `frontend/.../features/dev/dev-gallery.page.ts` and `.spec.ts` — gallery section + ledger.
- `e2e/tests/{booking-flow,messaging,memberships}.spec.ts` — the six `aria-label="Next day"` call sites.
- `docs/BACKLOG.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/NEXT-SESSION.md`.

**Task order rationale:** backend first (tasks 1–2) because the frontend edit flow calls it; then the component (3–4) because five screens consume it; then consumers (5–8); then the admin rebuild (9–10) which needs both the component and the backend; then verification and docs (11–13).

---

## Task 1: Fix `regenerateFrom`'s delete range

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/SlotRegenerationService.java:48-80`
- Test: `backend/src/test/java/com/boxhub/box/SlotRegenerationTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `SlotRegenerationService.regenerateFrom(UUID slotId, LocalDate from)` — unchanged signature, corrected behaviour. Task 2 calls it.

**Background (read before editing):** the delete is `findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, fromInstant)`, unbounded backwards. The recreate floors at today (`SessionGenerator.java:76`) and skips anything already started (`SessionGenerator.java:80`). So a `from` in the past deletes sessions between `from` and today that are **never refilled** — and because `session_item` cascades from `class_sessions` and `wod_score.session_item_id` cascades from `session_item`, it destroys every score logged against them. `docs/BACKLOG.md:774` records this.

- [ ] **Step 1: Write the failing test**

Add to `SlotRegenerationTest.java`:

```java
@Test
void regenerationNeverDeletesASessionThatHasAlreadyStarted() {
    // A slot whose sessions include one that ran YESTERDAY. Regenerating from a week ago must
    // leave it alone: the generator floors recreation at now, so anything earlier would be
    // deleted and never refilled — and a session that has run may carry scores, which cascade
    // through session_item to wod_score.
    var ctx = seedSlotWithSessions();

    ClassSession past = new ClassSession();
    past.setScheduleSlotId(ctx.slotId());
    past.setName("CrossFit");
    past.setStartAt(Instant.now().minus(1, ChronoUnit.DAYS));
    past.setDurationMin(60);
    past.setCapacity(12);
    past = sessions.save(past);
    UUID pastId = past.getId();

    regeneration.regenerateFrom(ctx.slotId(), LocalDate.now().minusWeeks(1));

    assertThat(sessions.findById(pastId))
            .as("a session that already started must survive regeneration from a past date")
            .isPresent();
}
```

Add the imports `java.time.temporal.ChronoUnit` and `java.util.UUID` if not already present.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=SlotRegenerationTest
```

Expected: FAIL — the past session is absent, because the unclamped delete removed it.

- [ ] **Step 3: Add the guard**

In `regenerateFrom`, replace the `inRange` lookup:

```java
Instant fromInstant = from.atStartOfDay(tz).toInstant();

// Never touch a session that has already started. The generator floors recreation at now
// (SessionGenerator:76,80), so a session earlier than that would be deleted and NEVER refilled;
// and a session that has run may carry scores, which cascade class_sessions -> session_item ->
// wod_score. Clamping here makes the delete range and the recreate range identical, which is the
// property that was missing. docs/BACKLOG.md recorded this as latent; wiring slot editing in
// M14b is what makes it reachable.
Instant now = Instant.now();
Instant floor = fromInstant.isBefore(now) ? now : fromInstant;

List<ClassSession> inRange = sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, floor);
```

Leave the rest of the method unchanged — the blocking check, the delete and the `generateForSlot` call all now operate on the clamped range.

- [ ] **Step 4: Run the whole regeneration suite**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='SlotRegenerationTest,EntitlementLimitsTest'
```

Expected: PASS. `EntitlementLimitsTest` is included because it calls `regenerateFrom(slotId, MONDAY.minusDays(1))` — a **past** `from` — and is the existing test most likely to be affected by this change. If it fails, read it before adjusting anything: it asserts ledger behaviour, and the fix must not change what it is testing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/box/SlotRegenerationService.java backend/src/test/java/com/boxhub/box/SlotRegenerationTest.java
git commit -m "fix(m14b): regeneration never deletes a session that has already started"
```

---

## Task 2: Route slot edits through regeneration

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/ClassTemplateController.java:63,112-144`
- Modify: `backend/src/main/java/com/boxhub/box/ClassSessionRepository.java`
- Test: `backend/src/test/java/com/boxhub/box/ClassTemplateApiTest.java`

**Interfaces:**
- Consumes: `SlotRegenerationService.regenerateFrom(UUID, LocalDate)` from Task 1.
- Produces: `PATCH /api/box/class-templates/{id}` accepting `applyFrom` (ISO date, optional, defaults to today) and returning `409 RANGE_HAS_BOOKINGS: <comma-separated ISO dates>` when refused. Task 10's modal consumes both.

**Background:** `patch` currently calls `generator.generateForBox(...)`, which is **additive only** — `generateForSlot` creates sessions that do not exist and skips ones that do. Moving a slot from 06:00 to 07:00 leaves every already-generated 06:00 session in place and adds 07:00 sessions beside them. This is live and `COACH`-reachable today; only the UI never sends those fields.

**No route is added** — `applyFrom` is a body field on the existing `PATCH /api/box/class-templates/{id}`, already registered `COACH` in `AuthzConformanceTest`'s `MIN_ROLE`. **Do not edit `AuthzConformanceTest`.**

- [ ] **Step 1: Write the failing tests**

Add to `ClassTemplateApiTest.java`:

```java
@Test
void movingASlotLeavesNoSessionAtTheOldTime() throws Exception {
    UUID slotId = createSlot("CrossFit", /*weekday*/ 1, "06:00");

    mvc.perform(patch("/api/box/class-templates/" + slotId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"startTime\":\"07:00\"}")
                    .headers(staffHeaders()))
            .andExpect(status().isOk());

    ZoneId tz = ZoneId.of(box.getTimezone());
    assertThat(sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, Instant.now()))
            .as("every future session must sit at the NEW time; an additive generate leaves the old ones")
            .allSatisfy(s -> assertThat(LocalTime.ofInstant(s.getStartAt(), tz)).isEqualTo(LocalTime.of(7, 0)));
}

@Test
void editingASlotWithABookedSessionIsRefusedAndChangesNothing() throws Exception {
    UUID slotId = createSlot("CrossFit", 1, "06:00");
    ClassSession booked = firstFutureSession(slotId);
    bookSession(booked.getId());

    mvc.perform(patch("/api/box/class-templates/" + slotId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"startTime\":\"07:00\"}")
                    .headers(staffHeaders()))
            .andExpect(status().isConflict())
            .andExpect(result -> assertThat(result.getResolvedException().getMessage())
                    .contains("RANGE_HAS_BOOKINGS")
                    .contains(LocalDate.ofInstant(booked.getStartAt(), ZoneId.of(box.getTimezone())).toString()));

    assertThat(slots.findById(slotId).orElseThrow().getStartTime())
            .as("a refused edit must not have written the slot either")
            .isEqualTo(LocalTime.of(6, 0));
}

@Test
void applyFromPastTheBlockingDatesSucceedsAndKeepsTheBookedSessionAtTheOldTime() throws Exception {
    UUID slotId = createSlot("CrossFit", 1, "06:00");
    ClassSession booked = firstFutureSession(slotId);
    bookSession(booked.getId());
    ZoneId tz = ZoneId.of(box.getTimezone());
    LocalDate after = LocalDate.ofInstant(booked.getStartAt(), tz).plusDays(1);

    mvc.perform(patch("/api/box/class-templates/" + slotId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"startTime\":\"07:00\",\"applyFrom\":\"" + after + "\"}")
                    .headers(staffHeaders()))
            .andExpect(status().isOk());

    assertThat(sessions.findById(booked.getId()).orElseThrow().getStartAt())
            .as("the already-booked session keeps its old time")
            .isEqualTo(booked.getStartAt());
}

@Test
void aRenameUpdatesFutureSessionsInPlaceAndIsNeverRefused() throws Exception {
    UUID slotId = createSlot("CrossFit", 1, "06:00");
    ClassSession booked = firstFutureSession(slotId);
    bookSession(booked.getId());   // would REFUSE a regeneration; a rename must not regenerate

    mvc.perform(patch("/api/box/class-templates/" + slotId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Barbell Club\"}")
                    .headers(staffHeaders()))
            .andExpect(status().isOk());

    assertThat(sessions.findById(booked.getId()).orElseThrow().getName())
            .as("ClassSession.name is a snapshot, so a rename must rewrite future sessions in place")
            .isEqualTo("Barbell Club");
}
```

Use the file's existing helpers for `createSlot`, `staffHeaders`, `bookSession` and `firstFutureSession`; if any is absent, write it as a small private helper in this test class rather than changing production code to suit the test.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassTemplateApiTest
```

Expected: all four FAIL — the first because the old 06:00 sessions survive, the second and third because nothing refuses, the fourth because the snapshot name is untouched.

- [ ] **Step 3: Add the rename bulk update**

In `ClassSessionRepository.java`:

```java
/**
 * Renames a type's not-yet-started sessions in place. ClassSession.name is a snapshot taken at
 * generation (SessionGenerator:84), so without this a rename leaves every already-generated
 * session carrying the old name until the horizon rolls over.
 *
 * Bounded to startAt >= now so history keeps the name it actually ran under.
 *
 * ClassSession is @TenantId, so this bulk update is silently scoped to the caller's box — which
 * is CORRECT here (the caller is the box). See docs/TENANCY.md: the trap is a query that needs to
 * be tenant-AGNOSTIC, which this is not.
 */
@Modifying(clearAutomatically = true, flushAutomatically = true)
@Query("update ClassSession s set s.name = :name where s.scheduleSlotId in :slotIds and s.startAt >= :now")
int renameFutureSessions(@Param("slotIds") List<UUID> slotIds, @Param("name") String name, @Param("now") Instant now);
```

Add imports for `Modifying`, `Query`, `Param`, `List`, `Instant`, `UUID`.

- [ ] **Step 4: Wire the controller**

Inject `SlotRegenerationService regeneration` and `ClassSessionRepository sessions` through the constructor alongside the existing dependencies.

Add `applyFrom` to the request record:

```java
record PatchTemplateRequest(String name, @Min(0) @Max(6) Integer weekday, String startTime, String imagePath,
                            @Min(1) Integer durationMin, @Min(1) Integer capacity,
                            UUID coachId, Boolean active, LocalDate applyFrom) {}
```

In `patch`, compute what changed **before** writing any field:

```java
// Computed BEFORE the setters below, or every comparison reads the value we just wrote.
boolean scheduleChanged =
        (req.weekday() != null && req.weekday() != s.getWeekday())
     || (req.startTime() != null && !LocalTime.parse(req.startTime()).equals(s.getStartTime()))
     || (req.durationMin() != null && req.durationMin() != s.getDurationMin())
     || (req.capacity() != null && req.capacity() != s.getCapacity())
     || (req.coachId() != null && !req.coachId().equals(s.getCoachId()));
boolean renamed = req.name() != null && !req.name().trim().equals(t.getName());
```

Then replace the trailing `if (savedSlot.isActive()) generator.generateForBox(...)` with:

```java
if (savedSlot.isActive()) {
    if (scheduleChanged) {
        // Regeneration REFUSES a range holding a live booking rather than cancelling it
        // (M14a decision 11) — both destructive options send mail, and an admin adjusting a
        // schedule must not be able to mail forty people by accident. The 409 carries the
        // blocking dates so the screen can offer a later applyFrom.
        ZoneId tz = ZoneId.of(boxes.findById(savedSlot.getBoxId()).orElseThrow().getTimezone());
        regeneration.regenerateFrom(savedSlot.getId(),
                req.applyFrom() != null ? req.applyFrom() : LocalDate.now(tz));
    } else {
        generator.generateForBox(TenantContext.requireBoxId());
    }
}

// A rename is NOT a regeneration: a name is not a booking-relevant number, so updating it in
// place invalidates nothing, whereas regenerating for a typo fix would be refused on any booked
// slot. Runs after the block above so a combined rename+reschedule renames the NEW sessions.
if (renamed) {
    List<UUID> slotIds = slots.findByClassTypeId(t.getId()).stream().map(ScheduleSlot::getId).toList();
    sessions.renameFutureSessions(slotIds, t.getName(), Instant.now());
}
```

Inject `BoxRepository boxes` for the timezone. Add imports for `LocalDate`, `ZoneId`, `Instant`.

- [ ] **Step 5: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassTemplateApiTest
```

Expected: PASS, all four.

- [ ] **Step 6: Run the full backend suite and confirm the conformance test is untouched**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: `Tests run: 754, Failures: 0, Errors: 0, Skipped: 0` and `BUILD SUCCESS` (749 baseline + 1 from Task 1 + 4 from Task 2).

Then, as its own command:

```bash
git diff --name-only | grep -c AuthzConformanceTest
```

Expected: `0`. A non-zero count means scope leaked — stop and report.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/box/ClassTemplateController.java backend/src/main/java/com/boxhub/box/ClassSessionRepository.java backend/src/test/java/com/boxhub/box/ClassTemplateApiTest.java
git commit -m "fix(m14b): a slot edit regenerates instead of generating additively"
```

---

## Task 3: `bh-week-calendar`

**Files:**
- Create: `frontend/src/app/ui/week-calendar.component.ts`
- Create: `frontend/src/app/ui/week-calendar.component.spec.ts`

**Interfaces:**
- Consumes: `IconComponent` from `./icon.component` (names `chevron-left`, `chevron-right`).
- Produces:
  - `export type DayTone = 'open' | 'full' | 'none';`
  - `export interface WeekDay { date: Date; offset: number; iso: string; tone: DayTone; selectable: boolean; }`
  - `WeekCalendarComponent` — selector `bh-week-calendar`, `offset = model(0)`, `max = input(13)`, `tones = input<Record<string, DayTone>>({})`, methods `shiftWeek(dir)`, `shiftDay(dir)`, `select(d: WeekDay)`.
  - Tasks 4–10 all consume these.

- [ ] **Step 1: Write the failing spec**

Create `frontend/src/app/ui/week-calendar.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { WeekCalendarComponent } from './week-calendar.component';

describe('WeekCalendarComponent', () => {
  function make(max = 13) {
    const fixture = TestBed.createComponent(WeekCalendarComponent);
    fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the calendar week containing the selected day, Monday first', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const week = cmp.week();
    expect(week.length).toBe(7);
    expect(week[0].date.getDay()).toBe(1); // Monday
    expect(week.some(d => d.offset === 0)).toBeTrue(); // today is in this week
  });

  it('marks days outside [0, max] unselectable', () => {
    const fixture = make(2);
    const week = fixture.componentInstance.week();
    expect(week.filter(d => d.selectable).every(d => d.offset >= 0 && d.offset <= 2)).toBeTrue();
    expect(week.some(d => !d.selectable)).toBeTrue();
  });

  it('shiftWeek moves seven days and clamps to [0, max]', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    cmp.shiftWeek(-1);
    expect(cmp.offset()).toBe(0); // cannot go before today
    cmp.shiftWeek(1);
    expect(cmp.offset()).toBe(7);
    cmp.shiftWeek(1);
    expect(cmp.offset()).toBe(13); // clamped at max, not 14
  });

  it('shiftDay moves one day and clamps', () => {
    const fixture = make(1);
    const cmp = fixture.componentInstance;
    cmp.shiftDay(-1);
    expect(cmp.offset()).toBe(0);
    cmp.shiftDay(1);
    expect(cmp.offset()).toBe(1);
    cmp.shiftDay(1);
    expect(cmp.offset()).toBe(1);
  });

  it('reads a tone by local ISO date and defaults absent days to none', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const todayIso = cmp.week().find(d => d.offset === 0)!.iso;
    fixture.componentRef.setInput('tones', { [todayIso]: 'full' });
    fixture.detectChanges();
    expect(cmp.week().find(d => d.offset === 0)!.tone).toBe('full');
    expect(cmp.week().filter(d => d.iso !== todayIso).every(d => d.tone === 'none')).toBeTrue();
  });

  it('selects only a selectable day', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    const past = cmp.week().find(d => !d.selectable);
    if (past) { cmp.select(past); expect(cmp.offset()).toBe(0); }
    const future = cmp.week().find(d => d.selectable && d.offset > 0)!;
    cmp.select(future);
    expect(cmp.offset()).toBe(future.offset);
  });

  it('ignores the click that ends a swipe', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    const target = cmp.week().find(d => d.selectable && d.offset > 0)!;
    cmp.onPointerDown({ clientX: 200, clientY: 100 } as PointerEvent);
    cmp.onPointerUp({ clientX: 100, clientY: 105 } as PointerEvent); // swipe left = next day
    expect(cmp.offset()).toBe(1);
    cmp.select(target); // the click the browser fires after that swipe
    expect(cmp.offset()).toBe(1); // suppressed, not jumped
  });

  it('does not page on a vertical drag', () => {
    const fixture = make(13);
    const cmp = fixture.componentInstance;
    cmp.onPointerDown({ clientX: 200, clientY: 100 } as PointerEvent);
    cmp.onPointerUp({ clientX: 190, clientY: 400 } as PointerEvent);
    expect(cmp.offset()).toBe(0);
  });

  it('gives every day an accessible name that states availability in words', () => {
    const fixture = make();
    const cmp = fixture.componentInstance;
    const todayIso = cmp.week().find(d => d.offset === 0)!.iso;
    fixture.componentRef.setInput('tones', { [todayIso]: 'full' });
    fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.day'))
      .map((b: any) => b.getAttribute('aria-label'));
    expect(labels.some((l: string) => l?.includes('classes full'))).toBeTrue();
    expect(labels.some((l: string) => l?.includes('no classes'))).toBeTrue();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `frontend/src/app/ui/week-calendar.component.ts`:

```typescript
import { Component, LOCALE_ID, computed, inject, input, model } from '@angular/core';
import { formatDate } from '@angular/common';
import { IconComponent } from './icon.component';

export type DayTone = 'open' | 'full' | 'none';

export interface WeekDay {
  date: Date;
  /** Days from today. Negative is in the past. */
  offset: number;
  /** Local calendar date, 'YYYY-MM-DD'. */
  iso: string;
  tone: DayTone;
  selectable: boolean;
}

function startOfDay(d: Date): Date { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }

/**
 * Local calendar date. NOT toISOString(), which converts to UTC and therefore reports the
 * PREVIOUS day for any local time before the UTC offset — the whole strip would key its dots one
 * day out for every box west of Greenwich.
 */
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Week strip: a Monday-first calendar week with one availability dot per day, above whatever the
 * screen projects as that day's list.
 *
 * Replaces bh-day-pager, which could only step one day at a time. Three ways to move, because the
 * filed complaint named three separate failures: the chevrons page a WEEK (and sit inside the
 * strip, in the thumb zone), a swipe pages a DAY, and tapping a day jumps straight to it — so
 * reaching any class in the horizon is one tap rather than up to thirteen.
 *
 * `offset` keeps bh-day-pager's contract exactly, which is what made the consumer swaps mechanical.
 */
@Component({
  selector: 'bh-week-calendar',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="strip" (pointerdown)="onPointerDown($event)" (pointerup)="onPointerUp($event)"
         (keydown)="onKeydown($event)">
      <div class="hd">
        <button type="button" class="pg" (click)="shiftWeek(-1)" [disabled]="!canPrev()"
                aria-label="Previous week" i18n-aria-label="@@ui.weekCalendar.prevWeek">
          <bh-icon name="chevron-left" />
        </button>
        <span class="mon" aria-live="polite">{{ monthLabel() }}</span>
        <button type="button" class="pg" (click)="shiftWeek(1)" [disabled]="!canNext()"
                aria-label="Next week" i18n-aria-label="@@ui.weekCalendar.nextWeek">
          <bh-icon name="chevron-right" />
        </button>
      </div>
      <div class="days">
        @for (d of week(); track d.iso) {
          <button type="button" class="day" [class.sel]="d.offset === offset()"
                  [disabled]="!d.selectable" [attr.aria-label]="dayLabel(d)"
                  [attr.aria-current]="d.offset === offset() ? 'date' : null"
                  [attr.data-testid]="'day-' + d.iso" (click)="select(d)">
            <span class="dow">{{ dowLabel(d) }}</span>
            <span class="dnum num">{{ d.date.getDate() }}</span>
            <span class="dot" [class.open]="d.tone === 'open'" [class.full]="d.tone === 'full'"
                  aria-hidden="true"></span>
          </button>
        }
      </div>
    </div>
    <ng-content />
  `,
  styles: [`
    .strip { margin-bottom: var(--sp-4); touch-action: pan-y; }
    .hd { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--sp-2);
      margin-bottom: var(--sp-2); }
    .pg { display: inline-flex; align-items: center; justify-content: center;
      min-width: var(--tap); min-height: var(--tap); background: var(--surface); color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-full); cursor: pointer; }
    .pg:disabled { opacity: 0.35; cursor: default; }
    .pg:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .mon { text-align: center; font-family: var(--font-display); font-weight: 700;
      font-size: var(--fs-h2); text-transform: uppercase; }
    .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--sp-1); }
    .day { display: flex; flex-direction: column; align-items: center; gap: 3px;
      min-height: var(--tap); padding: var(--sp-2) 0; background: transparent; color: var(--bone);
      border: 1px solid transparent; border-radius: var(--edge); cursor: pointer; }
    .day:hover:not(:disabled) { background: var(--surface); }
    .day:disabled { opacity: 0.3; cursor: default; }
    .day:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .day.sel { background: var(--surface-2); border-color: var(--hairline); }
    .dow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--faint); }
    .dnum { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-body); }
    .num { font-variant-numeric: tabular-nums; }
    /* Tone is carried by SHAPE, never by hue alone: filled = open, hollow ring = full,
       flat tick = none. The aria-label states it in words, so the strip is usable without
       seeing a dot at all. Not volt: the shell's box switcher already spends the volt budget,
       and a dot answers "is there room", not "live / now". */
    .dot { width: 6px; height: 6px; border-radius: var(--r-full); background: transparent;
      border: 1px solid transparent; box-sizing: border-box; }
    .dot.open { background: var(--bone); }
    .dot.full { border-color: var(--faint); }
    .dot:not(.open):not(.full) { width: 6px; height: 2px; border-radius: 0; background: var(--faint); }
  `],
})
export class WeekCalendarComponent {
  private locale = inject(LOCALE_ID);

  offset = model(0);
  /** Inclusive upper bound. 13 = a 2-week horizon, matching Box.bookingHorizonWeeks's default of 2. */
  max = input(13);
  /** Keyed by local ISO date ('YYYY-MM-DD'). An absent key means 'none'. */
  tones = input<Record<string, DayTone>>({});

  private swiped = false;
  private downX = 0;
  private downY = 0;

  readonly today = computed(() => startOfDay(new Date()));

  readonly selected = computed(() => {
    const d = new Date(this.today());
    d.setDate(d.getDate() + this.offset());
    return d;
  });

  readonly week = computed<WeekDay[]>(() => {
    const sel = this.selected();
    const today = this.today();
    const tones = this.tones();
    const max = this.max();
    const mondayIdx = (sel.getDay() + 6) % 7;         // JS Sunday=0 -> Monday-first index
    const start = new Date(sel);
    start.setDate(start.getDate() - mondayIdx);

    const out: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      // Math.round, not a plain divide: both ends are local midnight, so a DST boundary between
      // them makes the difference 23 or 25 hours and a truncating divide lands one day out.
      const offset = Math.round((date.getTime() - today.getTime()) / 864e5);
      const iso = isoOf(date);
      out.push({ date, offset, iso, tone: tones[iso] ?? 'none', selectable: offset >= 0 && offset <= max });
    }
    return out;
  });

  readonly canPrev = computed(() => this.week()[0].offset > 0);
  readonly canNext = computed(() => this.week()[6].offset < this.max());

  monthLabel(): string { return formatDate(this.selected(), 'LLLL y', this.locale); }
  dowLabel(d: WeekDay): string { return formatDate(d.date, 'EEEEE', this.locale); }

  dayLabel(d: WeekDay): string {
    return `${formatDate(d.date, 'EEEE d MMMM', this.locale)}, ${this.toneWord(d.tone)}`;
  }

  private toneWord(t: DayTone): string {
    if (t === 'open') return $localize`:@@ui.weekCalendar.tone.open:classes available`;
    if (t === 'full') return $localize`:@@ui.weekCalendar.tone.full:classes full`;
    return $localize`:@@ui.weekCalendar.tone.none:no classes`;
  }

  select(d: WeekDay) {
    // The browser fires a click at the end of a swipe that happens to finish over a day button.
    // Without this the swipe would page a day AND then jump to whatever it landed on.
    if (this.swiped) return;
    if (!d.selectable) return;                        // the guard lives here, not only on [disabled]
    if (d.offset !== this.offset()) this.offset.set(d.offset);
  }

  shiftDay(dir: number) {
    const next = Math.min(this.max(), Math.max(0, this.offset() + dir));
    if (next !== this.offset()) this.offset.set(next);
  }

  shiftWeek(dir: number) { this.shiftDay(dir * 7); }

  onPointerDown(e: PointerEvent) {
    this.swiped = false;                              // reset here, so a swipe that ends off a
    this.downX = e.clientX;                           // button cannot poison the next real tap
    this.downY = e.clientY;
  }

  onPointerUp(e: PointerEvent) {
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    // Horizontal intent only, so scrolling the day list vertically never pages the strip.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      this.swiped = true;
      this.shiftDay(dx < 0 ? 1 : -1);
    }
  }

  onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') { this.shiftDay(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { this.shiftDay(1); e.preventDefault(); }
  }
}
```

- [ ] **Step 4: Run the spec**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS, `TOTAL: 624 SUCCESS` (615 baseline + 9 new).

- [ ] **Step 5: Run the `ui/` cleanliness gates**

Each as its own command — **never chain these with `&&`**, a clean grep exits 1 and would abort the chain:

```bash
grep -c "@Input()\|@Output()\|ChangeDetectionStrategy.Eager" frontend/src/app/ui/week-calendar.component.ts
```

```bash
grep -cE "#[0-9a-fA-F]{3,8}\b" frontend/src/app/ui/week-calendar.component.ts
```

Expected: `0` from both.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/ui/week-calendar.component.ts frontend/src/app/ui/week-calendar.component.spec.ts
git commit -m "feat(m14b): bh-week-calendar, a week strip with availability dots"
```

---

## Task 4: Gallery section and seven-state ledger

**Files:**
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts:96` (imports), `:825-835` (the day-pager section), `:1057-1065` (the day-pager ledger)

**Interfaces:**
- Consumes: `WeekCalendarComponent`, `DayTone` from Task 3.
- Produces: a `data-gallery="week-calendar"` section. Task 11 screenshots it.

**Background:** the dev gallery IS the seven-states contract, and `dev-gallery.page.spec.ts` fails the build if any of the seven is unaccounted for. Replace the `day-pager` section **in place** so the DOM order — and therefore the baseline churn below it — changes as little as possible.

- [ ] **Step 1: Swap the import**

At line 96, replace `DayPagerComponent` with `WeekCalendarComponent`, and update the import statement at the top of the file from `../../ui/day-pager.component` to `../../ui/week-calendar.component`.

- [ ] **Step 2: Replace the gallery section**

Replace the whole `<section ... data-gallery="day-pager">` block with:

```html
      <section class="gsec" id="week-calendar" data-gallery="week-calendar">
        <h2 class="t-h2" i18n="@@dev.gallery.weekCalendar.heading">Week calendar</h2>
        <bh-week-calendar [tones]="galleryTones()" />
        <p class="note" i18n="@@dev.gallery.weekCalendar.note">
          Offset is a model — two-way bound by the athlete book page, the coach classes page and
          the admin schedule page. Chevrons page a week and disable at the [0, max] bounds; a swipe
          pages a day; tapping a day jumps to it. Dots carry availability by SHAPE, not hue —
          filled is open, a hollow ring is full, a flat tick is no classes — and each day's
          aria-label states it in words, so the strip works with no dot visible at all. Days
          outside [0, max] render dimmed and are not selectable.
        </p>
        <ng-container [ngTemplateOutlet]="ledger" [ngTemplateOutletContext]="{ $implicit: 'week-calendar' }" />
      </section>
```

- [ ] **Step 3: Add the fabricated tones**

The gallery must never call the API. Add to the component class, beside the other fabricated data:

```typescript
  /** ponytail: fabricated, per this page's "no API call — fabricated data only" rule. Keyed off
   *  real dates so the strip renders all three tones whatever day the gallery is opened. */
  protected readonly galleryTones = computed<Record<string, DayTone>>(() => {
    const iso = (n: number) => {
      const d = new Date(); d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    return { [iso(0)]: 'open', [iso(1)]: 'open', [iso(2)]: 'full' };
  });
```

Import `DayTone` from `../../ui/week-calendar.component` and `computed` from `@angular/core` if not already imported.

- [ ] **Step 4: Replace the ledger entry**

Replace the `'day-pager': [...]` entry with:

```typescript
    'week-calendar': [
      { state: 'default', how: 'rendered' },
      { state: 'hover', how: 'hand' },
      { state: 'focus', how: 'hand' },
      { state: 'active', how: 'rendered' },
      { state: 'disabled', how: 'rendered' },
      { state: 'loading', how: 'na', why: $localize`:@@dev.gallery.ledger.weekCalendar.loading:it derives its own dates; the screen beside it owns the fetch and its spinner. Absent tones is a resting state, not a loading one` },
      { state: 'error', how: 'na', why: $localize`:@@dev.gallery.ledger.weekCalendar.error:a date cannot fail to be a date; the screen renders any fetch error` },
    ],
```

`active` is `rendered` (the selected day) and `disabled` is `rendered` (days outside the bounds) — both are visible on the page without interaction, unlike the pager's, which is why these differ from the entry being replaced.

- [ ] **Step 5: Run Karma**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

Expected: PASS. The completeness spec asserts every `data-gallery` section has a ledger accounting for all seven states, and that every `na` carries a `why`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "feat(m14b): gallery section and seven-state ledger for bh-week-calendar"
```

---

## Task 5: Coach classes page adopts the strip

**Files:**
- Modify: `frontend/src/app/features/coach/classes.page.ts:5,11,22,60-64`

**Interfaces:**
- Consumes: `WeekCalendarComponent`, `DayTone` from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Swap the component**

Replace the `DayPagerComponent` import with `WeekCalendarComponent` and `DayTone` from `../../ui/week-calendar.component`; update the `imports` array; and replace

```html
<bh-day-pager [(offset)]="dayOffset" [max]="13" />
```

with

```html
<bh-week-calendar [(offset)]="dayOffset" [max]="13" [tones]="tones()" />
```

- [ ] **Step 2: Add the tones computed**

Add to the class, beside `daySessions`:

```typescript
  /** Per-day availability for the strip's dots, from sessions this page already fetched —
   *  no extra request. 'full' only when EVERY session that day is at capacity. */
  readonly tones = computed<Record<string, DayTone>>(() => {
    const out: Record<string, DayTone> = {};
    for (const s of this.sessions()) {
      const d = new Date(s.startAt);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const open = s.bookedCount < s.capacity;
      if (out[iso] === 'open') continue;
      out[iso] = open ? 'open' : 'full';
    }
    return out;
  });
```

- [ ] **Step 3: Fix the stale empty-state copy**

The current second line reads *"Flip through the week with ‹ › — or schedule class types in the Types tab."* The chevrons no longer move a day, so replace it with:

```html
<p class="e2" i18n="@@coach.classes.empty.hint">Pick another day from the strip above — or schedule class types in the Types tab.</p>
```

Mark the first line too if it is unmarked:

```html
<p class="e1" i18n="@@coach.classes.empty.title">No classes this day.</p>
```

- [ ] **Step 4: Build and test**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && env -u NODE_OPTIONS npm run build
```

Expected: Karma green, build with **zero** warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/coach/classes.page.ts
git commit -m "feat(m14b): coach classes page adopts the week strip"
```

---

## Task 6: Athlete book page adopts the strip

**Files:**
- Modify: `frontend/src/app/features/athlete/book.page.ts:7,15,18,125-131`

**Interfaces:**
- Consumes: `WeekCalendarComponent`, `DayTone` from Task 3.

**Scope note:** this is a **component swap, not a rebuild**. The photo cards, booking calls and error copy belong to M17a and must not be touched — including the stale `LIMIT_REACHED` copy and the missing `CANCEL_LIMIT_REACHED` case, which stay open and stay M17's.

- [ ] **Step 1: Swap the component**

Same edit as Task 5 Step 1: swap the import and the `imports` array, and replace the `<bh-day-pager .../>` tag with `<bh-week-calendar [(offset)]="dayOffset" [max]="13" [tones]="tones()" />`.

- [ ] **Step 2: Add the tones computed**

This page already has a `dayKey` helper, but the strip is keyed by local ISO. Add:

```typescript
  /** Per-day availability for the strip's dots, from sessions already fetched — no extra request.
   *  A day is 'open' if any session has a free place; 'full' only when every one is at capacity. */
  readonly tones = computed<Record<string, DayTone>>(() => {
    const out: Record<string, DayTone> = {};
    for (const s of this.sessions()) {
      const d = new Date(s.startAt);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const open = s.bookedCount < s.capacity;
      if (out[iso] === 'open') continue;
      out[iso] = open ? 'open' : 'full';
    }
    return out;
  });
```

- [ ] **Step 3: Fix the stale empty-state copy**

Replace *"Try another day with ‹ ›."* with:

```html
<p class="e2" i18n="@@athlete.book.empty.hint">Pick another day from the strip above.</p>
```

- [ ] **Step 4: Build and test**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && env -u NODE_OPTIONS npm run build
```

Expected: Karma green, zero build warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/athlete/book.page.ts
git commit -m "feat(m14b): athlete book page adopts the week strip"
```

---

## Task 7: Announcements picker adopts the strip, and `bh-day-pager` is deleted

**Files:**
- Modify: `frontend/src/app/features/messaging/announcements.page.ts:36,113`
- Delete: `frontend/src/app/ui/day-pager.component.ts`, `frontend/src/app/ui/day-pager.component.spec.ts`

**Interfaces:**
- Consumes: `WeekCalendarComponent` from Task 3.

**Scope note:** M29a's screen, and a **swap only**. The picker supplies no `tones` — a consumer with no availability data is a legitimate resting state, declared in the ledger.

- [ ] **Step 1: Swap the component**

In the `imports` array replace `DayPagerComponent` with `WeekCalendarComponent`, update the import path, and replace

```html
<bh-day-pager [offset]="pickerDayOffset()" (offsetChange)="onPickerDayChange($event)" [max]="13" />
```

with

```html
<bh-week-calendar [offset]="pickerDayOffset()" (offsetChange)="onPickerDayChange($event)" [max]="13" />
```

The one-way `[offset]` + `(offsetChange)` form works unchanged on a `model()`.

- [ ] **Step 2: Delete the old component**

```bash
git rm frontend/src/app/ui/day-pager.component.ts frontend/src/app/ui/day-pager.component.spec.ts
```

- [ ] **Step 3: Prove nothing still references it**

As its own command:

```bash
grep -rn "bh-day-pager\|DayPagerComponent\|day-pager" frontend/src | wc -l
```

Expected: `0`. If not, the remaining references must be swapped before continuing.

- [ ] **Step 4: Build and test**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && env -u NODE_OPTIONS npm run build
```

Expected: Karma green (the three day-pager specs are gone, so the total drops by 3), zero build warnings.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/app/features/messaging/announcements.page.ts frontend/src/app/ui/
git commit -m "refactor(m14b): announcements adopts the week strip; bh-day-pager is deleted"
```

---

## Task 8: Update the e2e selectors the deleted pager owned

**Files:**
- Modify: `e2e/tests/booking-flow.spec.ts:25,42`
- Modify: `e2e/tests/messaging.spec.ts:112,192,206`
- Modify: `e2e/tests/memberships.spec.ts:104`

**Interfaces:**
- Consumes: the `data-testid="day-<iso>"` and `aria-label="Next week"` hooks from Task 3.

**Background:** six call sites drive `button[aria-label="Next day"]`, which no longer exists. This is exactly the kind of break Karma cannot see.

- [ ] **Step 1: Replace each call site**

The intent at every one of these is *"move to a day that has a class"*. The strip does that in one action. Replace

```typescript
await page.locator('button[aria-label="Next day"]').click();
```

with a helper added to `e2e/tests/_support.ts`:

```typescript
/**
 * Move the week strip forward one day. bh-week-calendar's chevrons page a WEEK, so stepping a
 * single day means selecting the next day cell directly — which is also the interaction the
 * milestone exists to make cheap.
 */
export async function nextDay(page: Page) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.locator(`[data-testid="day-${iso}"]`).click();
}
```

and call `await nextDay(page);` at each of the six sites, importing it from `./_support`.

At `messaging.spec.ts:112` the locator is stored in a `nextBtn` variable and used later — read the surrounding lines and convert it to the same helper call rather than assuming a one-line substitution.

- [ ] **Step 2: Prove no call site was missed**

As its own command:

```bash
grep -rn "Next day" e2e | wc -l
```

Expected: `0`.

- [ ] **Step 3: Run the affected suites**

```bash
cd e2e && npx playwright test booking-flow.spec.ts messaging.spec.ts memberships.spec.ts
```

Expected: PASS. If the stack is dirty, re-run on a `down -v` stack before blaming the diff — `runner`/`tracking`/`tv` are non-idempotent.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/_support.ts e2e/tests/booking-flow.spec.ts e2e/tests/messaging.spec.ts e2e/tests/memberships.spec.ts
git commit -m "test(m14b): e2e drives the week strip instead of the deleted day pager"
```

---

## Task 9: Rebuild the admin schedule page

**Files:**
- Modify: `frontend/src/app/features/admin/schedule.page.ts` (full rewrite)
- Modify: `frontend/src/app/features/booking/booking.service.ts:70-72`

**Interfaces:**
- Consumes: `WeekCalendarComponent`/`DayTone` (Task 3), `applyFrom` on the patch endpoint (Task 2).
- Produces: `BookingService.patchTemplate(id, patch)` where `patch` accepts `applyFrom?: string`; a `(sessionPicked)` path Task 10's sheet opens from.

**Background — what is wrong with the current screen:** `(ngSubmit)` + `FormsModule` (banned by the M13d form contract), a native `<select>` of weekdays, slot creation as a cramped inline row of bare inputs, **no i18n marks at all**, `ChangeDetectionStrategy.Eager`, and a desktop-shaped `bh-data-table` of "next two weeks" at 360px.

- [ ] **Step 1: Widen the service type**

In `booking.service.ts`:

```typescript
  patchTemplate(id: string, patch: Partial<ClassTemplate> & { imagePath?: string; applyFrom?: string }): Observable<ClassTemplate> {
    return this.http.patch<ClassTemplate>(`/api/box/class-templates/${id}`, patch);
  }
```

- [ ] **Step 2: Rewrite the screen**

Replace `schedule.page.ts` entirely. Structure: **week strip → that day's sessions → tap a session to open the detail sheet**, with the slot list below and a slot editor in a `bh-sheet`.

Requirements this rewrite must satisfy, each of which is a gate:

- `imports` contains **no `FormsModule`**. The slot form is `<form (submit)="save($event)" novalidate>` with `event.preventDefault()` first in the handler.
- `bh-field` and `bh-select` bound `[(value)]` against signals — they are not `ControlValueAccessor`s.
- The weekday picker is a `bh-select` (seven short, plain labels — this is the sanctioned case for a select). The **slot picker** — choosing which slot to edit — is tappable rows in a `bh-sheet`, never a native select.
- Exactly **one** `bh-button variant="strong"`, `size="lg"`, `class="full"` — the slot form's save. This is a plumbing screen with no volt to spend. Every other action is `ghost` or `solid`.
- `ChangeDetectionStrategy.OnPush`, signal inputs only.
- **Every** string carries an `i18n` marker with an explicit `@@id`.
- Every fetch has loading / error / empty; every save has pending + inline error with the input preserved.
- The guard is in the handler, not only on `[disabled]`, and focus moves to whatever replaces a control that disappears.

The refusal path is the part most easily got wrong. When `patchTemplate` returns 409 with `RANGE_HAS_BOOKINGS: 2026-09-08, 2026-09-15`:

```typescript
  /** The 409 carries the blocking dates precisely so we can offer the way through rather than
   *  making the admin hunt. M14a decision 11: regeneration REFUSES rather than cancelling, because
   *  cancelling would mail everyone booked. */
  private onPatchError(e: { error?: { detail?: string } }) {
    const detail = e.error?.detail ?? '';
    const marker = 'RANGE_HAS_BOOKINGS:';
    if (!detail.startsWith(marker)) {
      this.error.set($localize`:@@admin.schedule.saveFailed:Could not save — try again.`);
      return;
    }
    const dates = detail.slice(marker.length).split(',').map(d => d.trim()).filter(Boolean);
    this.blockingDates.set(dates);
    const last = dates[dates.length - 1];
    const next = new Date(last + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    this.retryFrom.set(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  }
```

and render it as an inline `bh-alert` with a single retry action:

```html
@if (blockingDates().length) {
  <bh-alert tone="warn">
    <p i18n="@@admin.schedule.blocked.title">
      {{ blockingDates().length }} classes in this range have bookings.
    </p>
    <p i18n="@@admin.schedule.blocked.body">
      Changing the schedule would cancel them, so we haven't.
    </p>
    <bh-button variant="ghost" size="sm" data-testid="apply-from-retry" (click)="retryFromNextFreeDay()"
               i18n="@@admin.schedule.blocked.retry">Apply from {{ retryFrom() | date:'d MMM' }}</bh-button>
  </bh-alert>
}
```

`retryFromNextFreeDay()` re-sends the same patch with `applyFrom: this.retryFrom()`.

- [ ] **Step 3: Run the gates**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && env -u NODE_OPTIONS npm run build
```

Then each grep as its own command:

```bash
grep -c "FormsModule\|ngSubmit" frontend/src/app/features/admin/schedule.page.ts
```

```bash
grep -c "ChangeDetectionStrategy.Eager" frontend/src/app/features/admin/schedule.page.ts
```

```bash
grep -cE "#[0-9a-fA-F]{3,8}\b" frontend/src/app/features/admin/schedule.page.ts
```

Expected: `0` from all three. Karma green, zero build warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/admin/schedule.page.ts frontend/src/app/features/booking/booking.service.ts
git commit -m "feat(m14b): rebuild the admin schedule page on the week strip"
```

---

## Task 10: The admin class-detail modal

**Files:**
- Create: `frontend/src/app/features/admin/class-detail.sheet.ts`
- Modify: `frontend/src/app/features/admin/schedule.page.ts` (mount it)

**Interfaces:**
- Consumes: `BookingService.sessionDetail(id)`, `BookingService.roster(id)`, `BookingService.patchSession(id, patch)` — all already exist. `SheetComponent` from `../../ui/sheet.component`.
- Produces: `ClassDetailSheet` — `sessionId = input.required<string>()`, `open = input(false)`, `closed = output<void>()`, `changed = output<void>()`.

**It adds no read endpoint.** `GET /api/box/sessions/{id}/detail` and `GET /api/box/sessions/{id}/roster` already serve everything the modal shows.

- [ ] **Step 1: Build the sheet**

Contents: name, time, coach, capacity and booked/waitlist counts, the roster with per-athlete status, a cancel-this-session action, and a link into the builder.

Two traps that must be handled explicitly:

```typescript
  /**
   * bh-sheet's `open` is a ONE-WAY input, not a model — the component never clears it. So this
   * caller must reset its own signal on (closed), or the sheet will not reopen: setting the signal
   * true again won't re-run the effect because it never went false.
   */
```

```typescript
  /**
   * An in-shell route change does NOT destroy the shell, so a sheet left open stays open behind
   * the screen we navigated to. Close it explicitly before routing into the builder.
   */
  openBuilder() {
    this.closed.emit();
    this.router.navigate(['/coach/classes', this.sessionId(), 'build']);
  }
```

Cancelling is destructive, so it follows the design law's two-step: the control that **opens** the flow is a danger-bordered ghost; the control that **executes** it is `--danger`-filled with `--on-danger` (dark, not white) ink.

- [ ] **Step 2: Mount it on the schedule page**

Bind `[sessionId]`, `[open]`, and handle `(closed)` by resetting the page's own `openSessionId` signal to `null`, and `(changed)` by reloading the day's sessions.

- [ ] **Step 3: Run the gates**

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && env -u NODE_OPTIONS npm run build
```

Expected: Karma green, zero build warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/admin/class-detail.sheet.ts frontend/src/app/features/admin/schedule.page.ts
git commit -m "feat(m14b): admin class-detail modal on the existing detail and roster endpoints"
```

---

## Task 11: e2e for the strip and the rebuilt screen

**Files:**
- Create: `e2e/tests/schedule.spec.ts`

**Interfaces:**
- Consumes: `data-testid="day-<iso>"` (Task 3), the admin screen (Task 9), the sheet (Task 10).

**Background:** a screen is not verified until e2e runs on it. Karma cannot see a dead submit binding — specs that call `submit()` directly test the handler, never the wiring — and Task 9 moves this screen off `(ngSubmit)`, which is precisely the failure that shipped broken on login.

- [ ] **Step 1: Write the tests**

Cover, at minimum:

1. **The complaint, as a test.** From the coach classes page, a class on a later day is reachable in **one** tap on its day cell — not by repeated stepping.
2. **The dots tell the truth.** A day whose only session is at capacity renders `full`; a day with a free place renders `open`; a day with no sessions renders `none`. Assert via the day cell's `aria-label`, which states it in words, rather than by colour.
3. **The rebuilt admin form actually submits.** Fill the slot form, submit with the **keyboard** (Enter), and assert the slot appears — Enter submits regardless of any button's `[disabled]`, which is the case a disabled-button guard misses.
4. **The refusal path.** Book a session on a slot, edit that slot's start time, and assert the blocking-dates alert appears and the retry button applies from the next free day.

Rebuild the frontend image before running, and verify a new testid is in the **served** bundle before trusting a failure.

- [ ] **Step 2: Run**

```bash
cd e2e && npx playwright test schedule.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/schedule.spec.ts
git commit -m "test(m14b): e2e for the week strip, the dots and the schedule refusal path"
```

---

## Task 12: Regenerate the visual baselines

**Files:**
- Delete: `e2e/tests/visual.spec.ts-snapshots/day-pager-{phone,tablet,desktop}.png`
- Add: `e2e/tests/visual.spec.ts-snapshots/week-calendar-{phone,tablet,desktop}.png`
- Modify: whichever section baselines shift below it

**Background — two traps, both recorded:**
- Gallery sections are screenshotted individually but are **coupled through scroll position**, so a section whose height changes cascades dirty baselines to every section after it (`docs/BACKLOG.md`; M13e's `solid` addition dirtied 54 files this way). The strip is taller than the pager it replaces, and the sections after it are `wordmark`, `auth-layout` and `benchmark-board`.
- **Playwright rejects a screenshot on a DIMENSION mismatch before it consults `maxDiffPixels`**, so a 1px reflow bypasses the 100-pixel tolerance and reads as a hard failure.

`FROZEN_TIME` is **Wednesday 12 August 2026**, installed before `page.goto()`. The strip derives from `new Date()` client-side, exactly as the pager's `{{ day() | date }}` did, so that mechanism keeps working unchanged — and a mid-week freeze conveniently renders Mon 10 – Sun 16 with a selected day that is neither the first nor the last cell.

- [ ] **Step 1: Run the visual suite in the Linux container**

```bash
cd e2e && ./visual.sh
```

Never Playwright locally — you would compare against baselines your renderer never wrote.

- [ ] **Step 2: Review every changed baseline before accepting it**

Look at each one. A baseline that changed for a reason you cannot state is a defect, not a refresh.

- [ ] **Step 3: Update and re-run to confirm stability**

Regenerate, then run once more clean.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/visual.spec.ts-snapshots
git commit -m "test(m14b): regenerate the baselines the week strip moved"
```

---

## Task 13: Documentation

**Files:**
- Modify: `docs/BACKLOG.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/NEXT-SESSION.md`

- [ ] **Step 1: Close what this milestone closed**

In `docs/BACKLOG.md`:
- Remove the **day pager** entry (`:331`) — the complaint is fixed.
- Remove the **`SlotRegenerationService.regenerateFrom`** entry (`:774`) — fixed in Task 1, and it is no longer latent because Task 2 wired it.
- **Add** the deferred item from spec decision 8: *"A capacity change regenerates rather than applying in place, so it is refused on any slot with a booked session in range. Deliberate (M14b decision 8) — one mechanism, not two. Revisit if the pilot finds the refusal too blunt."*
- Leave the M17/M16b entries alone — they are not this milestone's.

- [ ] **Step 2: Mark M14b done**

In `docs/ROADMAP-AT-A-GLANCE.md`, set row 9's status to ✅ **done**.

- [ ] **Step 3: Commit the backlog and roadmap edits**

```bash
git add docs/BACKLOG.md docs/ROADMAP-AT-A-GLANCE.md
git commit -m "docs(m14b): close the day-pager and regeneration backlog entries"
```

- [ ] **Step 4: Rewrite the next-session prompt — AFTER Task 14's gate run, not now**

`.superpowers/sdd/NEXT-SESSION.md` must carry the **real** gate numbers, which do not exist until Task 14 has run. Writing it here would mean writing numbers you have predicted rather than measured, which is the one thing that document must never contain.

So: do Task 14 Steps 1–2 first, then come back and write this from the output those steps actually produced.

`.superpowers/sdd/NEXT-SESSION.md` is **the only one** — rewrite it in place, never create a second under `docs/`; a stale `docs/NEXT-SESSION-PROMPT.md` survived from M13d to M14a before being deleted. It must carry the measured gate numbers, the next milestone (**M14c-a**, the builder), and anything M14b learned that would cost the next session time.

```bash
git add .superpowers/sdd/NEXT-SESSION.md
git commit -m "docs(m14b): M14b closes"
```

---

## Task 14: Full gate run and merge

- [ ] **Step 1: Every gate, each as its own command**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

```bash
cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
```

```bash
cd frontend && env -u NODE_OPTIONS npm run build
```

```bash
cd e2e && npx playwright test
```

```bash
cd e2e && ./visual.sh
```

Expected: backend `754/0/0/0` + `BUILD SUCCESS`; Karma green; **zero** build warnings; Playwright green **except** `runner.spec.ts:43`, the known TV SSE bug owned by M37 — confirm it from the backend log (`TvStreamService.push()` logging *"tv push failed for device …; dropping the connection"*) rather than assuming, and **do not add retries**.

- [ ] **Step 2: The standing greps, each as its own command**

```bash
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' | wc -l
```

```bash
grep -rc "@Input()\|@Output()\|ChangeDetectionStrategy.Eager" frontend/src/app/ui/*.ts | grep -v ":0" | wc -l
```

```bash
grep -rn "bh-day-pager\|DayPagerComponent" frontend/src e2e | wc -l
```

```bash
git diff main --name-only | grep -c AuthzConformanceTest
```

Expected: `0` from all four.

- [ ] **Step 2b: The impeccable routine, per screen**

```
shape → build → audit (≥16/20) → critique (≥32/40) → fix every P0/P1 → re-score BOTH
```

Applies to **`admin/schedule.page.ts`**, **`bh-week-calendar` + its gallery section**, and **`coach/classes.page.ts`** (the strip changes how it is navigated, not just what it imports). The two swap-only screens do not get their own cycle.

`audit` runs **before** `critique`. Both run **with Claude in Chrome connected** — a source-only pass is provisional; if the browser is unavailable, **stop and ask, do not score anyway**. Chrome cannot render below ~500px, so **320/360/393 verification goes through Playwright**.

`interaction-design` applies to `bh-week-calendar` (new component). `harden` applies to the admin screen (it renders real data; a long gym name has pushed a page into horizontal scroll at 200% zoom before).

- [ ] **Step 3: Merge and delete the branch**

Merge and delete are one step; only `main` should remain.

```bash
git checkout main && git merge --no-ff m14b-schedule-classes && git branch -d m14b-schedule-classes
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 deliverable 1 — `bh-week-calendar` | 3, 4 |
| §1 deliverable 2 — coach classes page | 5 |
| §1 deliverable 3 — admin schedule page rebuilt | 9 |
| §1 deliverable 4 — admin class-detail modal | 10 |
| §2 decision 5 — `bh-day-pager` deleted, four consumers swap | 5, 6, 7 |
| §2 decision 9 — rename in place | 2 |
| §2 decision 10 — deactivate unchanged | no task; unchanged behaviour by design |
| §3.1–3.5 — API, layout, dots, swipe, a11y | 3 |
| §3.6 — seven states + gallery ledger | 4 |
| §3.7 — baseline traps | 12 |
| §5.1 — the additive-generate defect | 2 |
| §5.2 — the regeneration delete range | 1 |
| §5.3 — `applyFrom` and the refusal UX | 2, 9 |
| §7 tests 1–6 (backend) | 1, 2 |
| §7 tests 7–8 (e2e) | 11 |
| §7 impeccable routine | 14 |

**Known gap, deliberate:** the e2e selector fallout (Task 8) is not named in the spec — it was found while planning, and is listed here rather than sent back to the spec.

**Type consistency:** `DayTone` and `WeekDay` are defined once in Task 3 and imported by Tasks 4, 5, 6, 9. `offset`/`max`/`tones` keep identical names and types at every consumer. The local-ISO key format is identical in the component, all three `tones` computeds, the gallery's fabricated data and the e2e helper — it is repeated rather than shared deliberately, since a `ui/` component must not import from `features/`.
