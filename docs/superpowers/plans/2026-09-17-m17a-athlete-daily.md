# M17a — Athlete daily surface & the shared class card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild athlete Book, class detail and Home around one shared photo class card (also used by coach Classes), backed by five small backend additions.

**Architecture:** Backend adds `imagePath` to the session list, per-limit 409 codes, and three Home fields (`hasActivePlan`, `attendedThisWeek`, `suggestion`) — no migration, no new route. Frontend adds a presentational `ui/class-card` (projected badge + actions) and a pure `features/booking/class-state.ts` that encodes every athlete booking rule once; pages own role logic.

**Tech Stack:** Spring Boot 3.5 / Java 21 / JPA (Hibernate 6, `@TenantId`), MockMvc; Angular 22 signals, Karma/Jasmine; Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-17-m17a-athlete-daily-design.md` — read it before your task. It is a **living spec**: §5 gains each screen's shape decision before that screen's build task is dispatched. Decisions D1–D7 are user-ruled; do not reinterpret them.

## Global Constraints

- **Executors: run every command in the FOREGROUND. Never wait on a monitor. IGNORE the graphify PreToolUse hook. Leave the docker stack UP. Never commit — the orchestrator commits.** If the plan conflicts with the code you find, STOP and report; never improvise.
- Backend: `cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` (no `./mvnw`). Single class `-Dtest=ClassName`; several comma-separated (`-Dtest=A,B`). Judge by `Tests run:` and `BUILD SUCCESS`; "Mailer ... localhost, 1025" ERROR lines are pre-existing noise.
- Frontend: always `env -u NODE_OPTIONS`. Karma: `cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless`. Build: `env -u NODE_OPTIONS npm run build` (zero warnings). `ng build` does NOT compile specs; Karma does.
- **Every `Instant` seeded and compared after a DB round-trip is `.truncatedTo(ChronoUnit.MICROS)`.**
- Tenancy: tenant only from the JWT. Repository reads in tests go through `TenantContext.runAsBox(boxId, ...)` or the test's `actAsBox`. **No `runAsRoot`, no new native query** in this milestone — use JPQL so the `@TenantId` filter applies.
- `AuthzConformanceTest` is NOT edited in this milestone (no new route).
- Any count of "who is in the class" uses `BookingRepository.IN_CLASS`.
- Frontend design law: tokens only (no raw hex/px type sizes), **no volt** on any M17a screen (shell switcher owns it), `bh-button variant="strong"` for a lone primary action, mono only for prescription/meta/times, tabular numbers, 360px first, `--tap` targets, every new string `i18n`/`$localize`-marked with an explicit `@@id`, dates through `DatePipe`. No `FormsModule`. New components in `ui/`: `input()`/`output()` only, `ChangeDetectionStrategy.OnPush`, no raw px type sizes, no raw hex. Rebuilt screens drop `ChangeDetectionStrategy.Eager` and decorators.
- **No backtick inside a comment in an Angular `template:`/`styles:` literal.**
- A host attribute does not reach an inner element: components take a `testId` input and bind it inside; `bh-button` uses `testId`, never `data-testid`.
- Past-day rules (spec §1.1) are binding and must survive every rebuild.

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `backend/.../box/SessionController.java` | 1 | `SessionView.imagePath`, batched slot/type lookup |
| `backend/src/test/.../box/SessionApiTest.java` | 1 | image on list |
| `backend/.../box/BookingService.java` | 2 | rule code as 409 reason |
| `backend/src/test/.../box/{EntitlementLimitsTest,BookingEntitlementTest,BookingEngineTest}.java` | 2 | expected codes |
| `backend/.../box/BookingRepository.java` | 3, 4 | `attendedStartsBetween`, `attendedSlotCounts` (JPQL) |
| `backend/.../box/HomeController.java` | 3, 4 | `hasActivePlan`, `attendedThisWeek`, box-tz week, `suggestion` |
| `backend/src/test/.../box/HomeSurfaceApiTest.java` | 3 | new fields |
| `backend/src/test/.../box/HomeSuggestionTest.java` (new) | 4 | suggestion rules |
| `frontend/.../booking/booking.service.ts` | 5 | `SessionView.imagePath` |
| `frontend/.../athlete/home.service.ts` | 5 | `hasActivePlan`, `attendedThisWeek`, `Suggestion` |
| `frontend/.../booking/session-window.ts` + spec | 5 | `isPastDay(startAt, now?)` |
| `frontend/.../booking/class-state.ts` + spec (new) | 5 | `athleteState` |
| `frontend/.../booking/booking-reason.ts` + spec (new) | 5 | 409 code → localized copy |
| `frontend/src/app/ui/class-card.component.ts` + spec (new) | 7 | the card |
| `frontend/.../dev/dev-gallery.page.ts` + spec | 7 | `class-card` section + ledger |
| `frontend/.../athlete/book.page.ts` + spec | 8 | Book rebuild |
| `frontend/.../coach/classes.page.ts` + spec | 10 | coach rows → card |
| `frontend/.../athlete/class-detail.page.ts` + spec | 12 | detail + action |
| `frontend/.../athlete/home.page.ts` + spec | 14 | Home rebuild |
| `e2e/tests/{booking-flow,memberships,messaging,schedule,security,tracking,library,programming}.spec.ts` | 8, 10 | locators follow the new card |
| `e2e/tests/athlete-daily.spec.ts` (new) | 16 | M17a wiring |

---

## Phase A — Backend

### Task 1: `imagePath` on the session list

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/SessionController.java` (record at ~line 55, `list` ~59–92, `patch` return ~127)
- Test: `backend/src/test/java/com/boxhub/box/SessionApiTest.java`

**Interfaces:**
- Produces: `SessionView(..., Integer myPosition, String imagePath)` — `imagePath` is the LAST component; signed URL or null.

- [ ] **Step 1: Read `SessionApiTest.java`** to learn its fixture helpers (box, member tokens, `actAsBox`). Also read how `SessionDetailController.detail` resolves the image (slot → type → `mediaSigner.sign`). Confirm `SessionController` already has `ScheduleSlotRepository`/`ClassTypeRepository` injected; if not, add them to the constructor.

- [ ] **Step 2: Write the failing test** in `SessionApiTest`:

```java
@Test
void listCarriesTheClassTypeImageThroughTheSlot() throws Exception {
    // Arrange: a ClassType with imagePath "cl-test.png", a ScheduleSlot pointing at it,
    // and a session with scheduleSlotId = that slot, all inside the test box (use the
    // file's existing actAsBox/TenantContext pattern). A second session with NO slot.
    // Act: GET /api/box/sessions?from=..&to=.. as a member of that box.
    // Assert: the slotted session's imagePath is non-null and contains "cl-test";
    //         the slot-less session's imagePath is null.
}
```

Write it concretely against the fixture you read: `ClassType t = new ClassType(); t.setName(...); t.setImagePath("cl-test.png"); types.save(t);` then `ScheduleSlot sl = new ScheduleSlot(); sl.setClassTypeId(t.getId()); sl.setWeekday(0); sl.setStartTime(LocalTime.of(9,0)); sl.setDurationMin(60); sl.setCapacity(10); slots.save(sl);` and `s.setScheduleSlotId(sl.getId())`. Check `ClassType`'s required columns before saving (open the entity). Use `jsonPath("$[?(@.id=='" + id + "')].imagePath")`. If `MediaSigner.sign` returns something that does not contain the raw path, assert non-null only and say so in your report.

- [ ] **Step 3: Run it — expect FAIL** (`imagePath` missing).

`JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=SessionApiTest`

- [ ] **Step 4: Implement.** Append `String imagePath` to the record. In `list`, before the loop:

```java
// One lookup per distinct slot and type, not per row: the list can span a month of sessions.
Map<UUID, String> imageBySlot = new HashMap<>();
for (UUID slotId : sessionList.stream().map(ClassSession::getScheduleSlotId)
        .filter(Objects::nonNull).distinct().toList()) {
    slots.findById(slotId).flatMap(sl -> types.findById(sl.getClassTypeId()))
            .map(ClassType::getImagePath)
            .ifPresent(p -> imageBySlot.put(slotId, mediaSigner.sign(p)));
}
```

and pass `s.getScheduleSlotId() == null ? null : imageBySlot.get(s.getScheduleSlotId())` as the last argument. In `patch`, pass `null` (the patch response is not rendered as a card). Grep for every other `new SessionView(` in `backend/src` and update it too.

- [ ] **Step 5: Run `-Dtest=SessionApiTest` — expect PASS**, then the full backend suite — expect all green.

---

### Task 1b: coach avatar and the first five athletes on the session list

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/SessionController.java` (`SessionView`, `list`, `patch`)
- Test: `backend/src/test/java/com/boxhub/box/SessionApiTest.java`
- Modify: `frontend/src/app/features/booking/booking.service.ts` (`SessionView` gains `coachAvatarPath: string | null; people: Person[]`, plus `export interface Person { name: string; avatarPath: string | null; }`) and every spec fixture building a `SessionView` (`grep -rln "myBookingStatus" /Users/alessandrolomonaco/dev/boxhub/frontend/src` — add `coachAvatarPath: null, people: []`).

**Interfaces:**
- Produces: `SessionView(..., String imagePath, String coachAvatarPath, List<Person> people)` with `public record Person(String name, String avatarPath) {}` nested in `SessionController`. `people` = the first **5** IN_CLASS bookings that have a membership, in the order `findBySessionIdAndStatusInOrderByPosition` already returns, each with the member's name and `mediaSigner.sign(avatarPath)`. `coachAvatarPath` = the coach's membership avatar in the caller's box, signed; null when no coach or no avatar. `booked` (names) stays as is. `patch` passes `null, List.of()`.

- [ ] **Step 1: Failing test** in `SessionApiTest`:

```java
@Test
void listCarriesTheCoachAvatarAndTheFirstFiveAthletes() throws Exception {
    // Arrange (actAsBox(boxA)): give the coach membership an avatarPath "av-coach.png"; set the
    // session's coachId to the coach's user id; create 6 athlete memberships in boxA (names A1..A6,
    // A1 with avatarPath "av-a1.png") and a BOOKED booking for each on sessionId, positions 1..6.
    // Act: GET /api/box/sessions as coachToken.
    // Assert on the session with id == sessionId:
    //   coachAvatarPath contains "av-coach"
    //   people has length 5; people[0].name == "A1"; people[0].avatarPath contains "av-a1";
    //   people[1].avatarPath is null; bookedCount == 6
}
```

Read the file's fixture first: reuse how it registers users/memberships (`authService.register`, `memberships.save`) and how the coach is created. Booking needs `setSessionId`, `setMembershipId`, `setStatus("BOOKED")`, `setPosition(i)`.

- [ ] **Step 2: Run `-Dtest=com.boxhub.box.SessionApiTest` — expect FAIL** (the bare name also matches `identity.SessionApiTest`).

- [ ] **Step 3: Implement.** In `list`, the coach lookup already resolves users once per coach id; extend it to also resolve the coach's membership avatar once per coach id:

```java
Map<UUID, String> coachAvatars = new HashMap<>();
// inside the existing coach loop, once per coach id:
memberships.findByUserIdAndBoxId(s.getCoachId(), TenantContext.requireBoxId())
        .map(Membership::getAvatarPath).map(mediaSigner::sign)
        .ifPresent(a -> coachAvatars.put(s.getCoachId(), a));
```

In the per-session loop, build `people` from the membership lookups the loop already does for `bookedNames` (do not add a second query per booking):

```java
List<Person> people = new ArrayList<>();
// in the existing for (Booking b : bookedRows) loop, after resolving m:
if (people.size() < 5) people.add(new Person(m.getUser().getName(), mediaSigner.sign(m.getAvatarPath())));
```

Check `MediaSigner.sign(null)` returns null (it is already called with nullable paths elsewhere). Pass `coachAvatars.get(s.getCoachId())` (null-safe for a null coach id — guard it) and `people`.

- [ ] **Step 4: Frontend types + fixtures** as listed under Files.

- [ ] **Step 5: Verify.** `-Dtest=com.boxhub.box.SessionApiTest` PASS; full backend suite green; Karma green; build zero warnings.

---

### Task 2: Per-limit 409 reason

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingService.java` (~lines 59–64 and ~116–121)
- Test: `backend/src/test/java/com/boxhub/box/EntitlementLimitsTest.java` (lines ~177, 194, 224, 276, 295, 322, 349), `BookingEntitlementTest.java:150`, `BookingEngineTest.java:194`

**Interfaces:**
- Produces: 409 `detail` is one of `ENTRIES_TOTAL | ENTRIES_PER_MONTH | ENTRIES_PER_WEEK | ENTRIES_PER_DAY` on book, and `CANCELLATIONS_TOTAL | CANCELLATIONS_PER_MONTH | CANCELLATIONS_PER_WEEK | CANCELLATIONS_PER_DAY` on cancel. `LIMIT_REACHED` and `CANCEL_LIMIT_REACHED` no longer exist anywhere.

- [ ] **Step 1: Update the tests first.** For each assertion listed, replace the old string with the code of the rule that binds in that test. `firstViolated` checks TOTAL → MONTH → WEEK → DAY and returns the first that binds, so read each test's plan setup and its bookings. Known: line 194's test configures day 3 / week 10 and books a fourth in a day → `ENTRIES_PER_DAY`; line 224 (week binds on an empty day) → `ENTRIES_PER_WEEK`; 276 and 322 (`setEntriesPerWeek(1)`) → `ENTRIES_PER_WEEK`; 295 (`setCancellationsPerWeek(1)`) → `CANCELLATIONS_PER_WEEK`; 349 (`setEntriesTotal(2)`) → `ENTRIES_TOTAL`. Determine 177, `BookingEntitlementTest:150` and `BookingEngineTest:194` by reading them; report what you chose and why.

- [ ] **Step 2: Run those three classes — expect FAIL** on the changed assertions.

`JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=EntitlementLimitsTest,BookingEntitlementTest,BookingEngineTest`

- [ ] **Step 3: Implement.** Book path — replace the ponytail comment and the `if` with:

```java
// The rule's own code reaches the wire (M17a): the athlete is told WHICH limit stopped them.
String violated = entryLimitViolated(session, box, membershipId, active);
if (violated != null) throw conflict(violated);
```

Cancel path:

```java
String violated = ledger.firstViolated(PlanLimits.CANCELLATION_RULES, plan, active,
        session.getStartAt(), ZoneId.of(box.getTimezone()), membershipId);
if (violated != null) throw conflict(violated);
```

- [ ] **Step 4: Verify no stragglers.**

`grep -rn "LIMIT_REACHED" /Users/alessandrolomonaco/dev/boxhub/backend/src /Users/alessandrolomonaco/dev/boxhub/e2e` → must be empty. (`frontend/.../book.page.ts` still has it; Task 5/8 remove it.)

- [ ] **Step 5: Run the three classes — PASS; full backend suite — green.**

---

### Task 3: Home — `hasActivePlan`, `attendedThisWeek`, box-timezone week

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/HomeController.java`
- Test: `backend/src/test/java/com/boxhub/box/HomeSurfaceApiTest.java`

**Interfaces:**
- Produces: `HomeDto(NextBooking nextBooking, AnnouncementView announcement, Stats stats, boolean planExpiringSoon, long announcementUnread, boolean hasActivePlan, List<LocalDate> attendedThisWeek, Suggestion suggestion)` — Task 3 adds the first two new fields and passes `null` for `suggestion` (declare `public record Suggestion(UUID sessionId, String name, Instant startAt, String imagePath, int bookedCount, int capacity) {}` now so Task 4 only fills it). `attendedThisWeek` serialises as `["2026-09-15", ...]` (ISO dates; check `application.yml` for `write-dates-as-timestamps` — if dates serialise as arrays, report it rather than changing global config).
- Produces: `BookingRepository.attendedStartsBetween(UUID membershipId, Instant from, Instant to): List<Instant>`.

- [ ] **Step 1: Write failing tests** in `HomeSurfaceApiTest`:

```java
@Test
void homeSaysWhetherThereIsAnActivePlan() throws Exception {
    mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
            .andExpect(jsonPath("$.hasActivePlan").value(true));
    // a second athlete in box A with NO subscription
    // (create with member(...) in the test body; box A is a field? if setup() keeps it local,
    //  promote `Box a` to a field)
    mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + planless))
            .andExpect(jsonPath("$.hasActivePlan").value(false));
}

@Test
void attendedThisWeekListsCheckedInDaysOnly() throws Exception {
    // Arrange (actAsBox(a)): two sessions earlier THIS week in Europe/Rome — pick
    // LocalDate.now(ZoneId.of("Europe/Rome")).with(DayOfWeek.MONDAY) at 07:00 and the same day
    // at 18:00, plus one on Monday+1 at 07:00 only if that is not in the future (skip otherwise).
    // Save a CHECKED_IN booking for the athlete on the Monday 07:00 session and a BOOKED
    // (not checked in) booking on Monday 18:00. Booking needs box, session, membership, status,
    // position, bookedAt — mirror how other tests in this package construct a Booking.
    // Assert: $.attendedThisWeek has exactly one entry, equal to Monday's ISO date.
}
```

If "now" is Monday before 07:00 Rome time, the Monday session would be in the future; use `Monday 00:30` instead of 07:00 to keep the test deterministic, and note it in a comment.

- [ ] **Step 2: Run `-Dtest=HomeSurfaceApiTest` — expect FAIL.**

- [ ] **Step 3: Implement the repository query (JPQL — tenant filter applies; no native):**

```java
// Start times of the athlete's CHECKED_IN classes in a window — Home's "days attended" strip.
// JPQL on purpose: both entities are @TenantId, so this stays inside the caller's box.
@Query("""
        select s.startAt from Booking b, ClassSession s
        where s.id = b.sessionId and b.membershipId = :mid and b.status = 'CHECKED_IN'
          and s.startAt >= :from and s.startAt < :to
        """)
List<Instant> attendedStartsBetween(@Param("mid") UUID membershipId,
                                    @Param("from") Instant from, @Param("to") Instant to);
```

Check `Booking`'s field names (`sessionId`, `membershipId`, `status`) and `ClassSession`'s (`startAt`) before writing it.

- [ ] **Step 4: Implement in `HomeController`.** Inject `BoxRepository boxes`. Replace `ZoneId zone = ZoneId.systemDefault();` with the box's zone, so the week the strip shows is the box's week:

```java
ZoneId zone = boxes.findById(TenantContext.requireBoxId())
        .map(b -> ZoneId.of(b.getTimezone())).orElse(ZoneId.systemDefault());
```

(`planDaysLeft` currently uses `LocalDate.now()` — change it to `LocalDate.now(zone)`.) Then:

```java
List<LocalDate> attended = bookings.attendedStartsBetween(me.getId(), weekStart, weekEnd).stream()
        .map(i -> i.atZone(zone).toLocalDate()).distinct().sorted().toList();
boolean hasActivePlan = subscriptions.activeFor(me.getId()).isPresent();
```

Reuse the one `activeFor` result for both `subEnd` and `hasActivePlan` (call it once). Return `new HomeDto(next, ann, stats, expiring, unread, hasActivePlan, attended, null)`.

- [ ] **Step 5: Run `-Dtest=HomeSurfaceApiTest` — PASS; full suite — green.**

---

### Task 4: Home — habit suggestion

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/HomeController.java`
- Create: `backend/src/test/java/com/boxhub/box/HomeSuggestionTest.java`

**Interfaces:**
- Consumes: `HomeController.Suggestion` (Task 3).
- Produces: `BookingRepository.attendedSlotCounts(UUID membershipId, Instant from, Instant to): List<Object[]>` — rows `[UUID slotId, Long count]`, count desc.

Rule (spec §2.5): habit slots = `schedule_slot_id`s with **≥ 2** CHECKED_IN bookings for the caller whose session started in `[now − 8 weeks, now)`. Walk them in tiers of equal count, highest first. In a tier, candidates = each slot's `SCHEDULED` sessions starting in `(now, now + 7 days]` where the caller has **no non-CANCELLED booking** and `countBySessionIdAndStatusIn(id, IN_CLASS) < capacity`; take the **earliest** candidate of the tier. First tier with a candidate wins. None → `null`.

- [ ] **Step 1: Write `HomeSuggestionTest`** — copy the fixture shape of `HomeSurfaceApiTest` (two boxes, `member(...)`, `actAsBox`, a plan + `recordPeriod` so bookings are legal). Helper methods to write in the test:

```java
private UUID slot(int weekday, LocalTime at) { /* ClassType + ScheduleSlot in box A, return slot id */ }
private UUID session(UUID slotId, Instant startAt, int capacity) { /* ClassSession with scheduleSlotId, SCHEDULED */ }
private void booking(UUID sessionId, UUID membershipId, String status) { /* Booking row */ }
private static Instant daysFromNow(long d) { return Instant.now().plus(Duration.ofDays(d)).truncatedTo(ChronoUnit.MICROS); }
```

Tests (each asserts on `GET /api/box/home` as the athlete):

```java
@Test void suggestsTheNextSessionOfTheSlotAttendedMost()
  // slot M: 3 past CHECKED_IN (−7,−14,−21 d); slot E: 2 past CHECKED_IN.
  // future: M at +2d, E at +1d. → $.suggestion.sessionId == M's +2d session
  //   (M's tier outranks E's even though E is sooner).
@Test void noSuggestionWithoutHistory()                 // → $.suggestion doesNotExist / isEmpty
@Test void oneVisitIsNotAHabit()                         // 1 past CHECKED_IN on M, future M → null
@Test void bookedOrCancelledHandling()
  // habit M, future M at +2d already BOOKED by the athlete → null;
  // then CANCEL that booking (status CANCELLED) → suggestion returns the +2d session.
@Test void aFullSessionIsSkippedForTheNextOne()
  // habit M; future M at +1d capacity 1 with another member BOOKED; M at +6d open → +6d
@Test void fallsBackToTheNextHabitTier()
  // M (3 visits) has no future session in 7 days; E (2 visits) has one at +3d → E's
@Test void bookedButNotCheckedInDoesNotBuildAHabit()     // 3 past BOOKED on M → null
@Test void anotherBoxsHistoryNeverSuggests()
  // otherAthlete in box B has a habit in box B; athlete in box A has none → athlete gets null,
  // and otherAthlete's suggestion (if any) is a box-B session id, never box A's.
```

Use `jsonPath("$.suggestion").doesNotExist()` or `.value(nullValue())` — check which the existing Jackson config produces for a null record component (the test for `nextBooking` uses `doesNotExist()`).

- [ ] **Step 2: Run `-Dtest=HomeSuggestionTest` — expect FAIL.**

- [ ] **Step 3: Repository query (JPQL):**

```java
// Home's habit suggestion: how often the athlete actually attended each schedule slot.
@Query("""
        select s.scheduleSlotId, count(b) from Booking b, ClassSession s
        where s.id = b.sessionId and b.membershipId = :mid and b.status = 'CHECKED_IN'
          and s.scheduleSlotId is not null and s.startAt >= :from and s.startAt < :to
        group by s.scheduleSlotId
        having count(b) >= 2
        order by count(b) desc
        """)
List<Object[]> attendedSlotCounts(@Param("mid") UUID membershipId,
                                  @Param("from") Instant from, @Param("to") Instant to);
```

Add to `ClassSessionRepository`:

```java
List<ClassSession> findByScheduleSlotIdAndStatusAndStartAtBetweenOrderByStartAt(
        UUID scheduleSlotId, String status, Instant from, Instant to);
```

- [ ] **Step 4: Implement `suggestion(UUID membershipId)` in `HomeController`:**

```java
private Suggestion suggestion(UUID membershipId) {
    Instant now = Instant.now();
    List<Object[]> habits = bookings.attendedSlotCounts(membershipId, now.minus(Duration.ofDays(56)), now);
    int i = 0;
    while (i < habits.size()) {
        long tier = (Long) habits.get(i)[1];
        ClassSession best = null;
        for (; i < habits.size() && (Long) habits.get(i)[1] == tier; i++) {
            UUID slotId = (UUID) habits.get(i)[0];
            for (ClassSession s : sessions.findByScheduleSlotIdAndStatusAndStartAtBetweenOrderByStartAt(
                    slotId, "SCHEDULED", now, now.plus(Duration.ofDays(7)))) {
                if (!s.getStartAt().isAfter(now)) continue;
                if (bookings.findBySessionIdAndMembershipIdAndStatusNot(s.getId(), membershipId, "CANCELLED").isPresent()) continue;
                if (bookings.countBySessionIdAndStatusIn(s.getId(), BookingRepository.IN_CLASS) >= s.getCapacity()) continue;
                if (best == null || s.getStartAt().isBefore(best.getStartAt())) best = s;
                break; // sessions are ordered: the first eligible one is this slot's earliest
            }
        }
        if (best != null) {
            String image = mediaSigner.sign(slots.findById(best.getScheduleSlotId())
                    .flatMap(sl -> types.findById(sl.getClassTypeId())).map(ClassType::getImagePath).orElse(null));
            int booked = (int) bookings.countBySessionIdAndStatusIn(best.getId(), BookingRepository.IN_CLASS);
            return new Suggestion(best.getId(), best.getName(), best.getStartAt(), image, booked, best.getCapacity());
        }
    }
    return null;
}
```

Status constant: confirm the scheduled status string in `ClassSession` (the list endpoint filters `CANCELLED`; generation sets something — grep `setStatus(` in `SessionGenerator`). Call `suggestion(me.getId())` **only when `next == null`** (the card only shows with nothing booked) — and state that in a comment; tests must book nothing upcoming except where asserted. `bookedOrCancelledHandling` then needs care: with a BOOKED future session, `nextBooking` is non-null and suggestion is skipped → null, which is what it asserts.

- [ ] **Step 5: Run `-Dtest=HomeSuggestionTest,HomeSurfaceApiTest` — PASS; full suite — green.**

---

## Phase B — Shared frontend logic

### Task 5: Wire types, `isPastDay(now)`, `athleteState`, `bookingReason`

**Files:**
- Modify: `frontend/src/app/features/booking/booking.service.ts` (`SessionView` gains `imagePath: string | null`)
- Modify: `frontend/src/app/features/athlete/home.service.ts` (`Home` gains `hasActivePlan: boolean; attendedThisWeek: string[]; suggestion: Suggestion | null`; add `export interface Suggestion { sessionId: string; name: string; startAt: string; imagePath: string | null; bookedCount: number; capacity: number; }`)
- Modify: `frontend/src/app/features/booking/session-window.ts` + `session-window.spec.ts`
- Create: `frontend/src/app/features/booking/class-state.ts` + `class-state.spec.ts`
- Create: `frontend/src/app/features/booking/booking-reason.ts` + `booking-reason.spec.ts`
- Grep and fix every spec/mock building a `SessionView` or `Home` literal: `grep -rln "myBookingStatus\|planExpiringSoon" /Users/alessandrolomonaco/dev/boxhub/frontend/src` — add the new fields to each fixture.

**Interfaces:**
- Produces:

```ts
export function isPastDay(startAt: string, now: Date = new Date()): boolean;

export type Phase = 'finished' | 'started' | 'upcoming';
export type Mine = 'attended' | 'booked' | 'waitlist' | null;
export type Action = 'book' | 'waitlist' | 'cancel' | 'leave' | null;
export interface AthleteState { phase: Phase; mine: Mine; position: number | null; action: Action; spotsLeft: number | null; full: boolean; }
export function athleteState(s: Pick<SessionView, 'startAt' | 'capacity' | 'bookedCount' | 'myBookingStatus' | 'myPosition'>, now?: Date): AthleteState;

export function bookingReason(code: string | undefined): string;
```

- [ ] **Step 1: `isPastDay` accepts `now`.** Change the body's `const today = new Date();` to `const today = new Date(now);`. Add a spec case: `isPastDay('2026-01-01T23:00:00', new Date('2026-01-02T00:30:00'))` → `true`; `isPastDay('2026-01-02T00:10:00', new Date('2026-01-02T23:59:00'))` → `false`.

- [ ] **Step 2: Write `class-state.spec.ts` first:**

```ts
import { athleteState } from './class-state';

const NOW = new Date(2026, 8, 17, 12, 0); // local 17 Sep 2026 12:00
const at = (d: number, h: number) => new Date(2026, 8, d, h, 0).toISOString();
const base = { capacity: 10, bookedCount: 3, myBookingStatus: null as string | null, myPosition: null as number | null };

describe('athleteState', () => {
  it('upcoming, not mine, room → book with spots', () => {
    expect(athleteState({ ...base, startAt: at(17, 18) }, NOW))
      .toEqual({ phase: 'upcoming', mine: null, position: null, action: 'book', spotsLeft: 7, full: false });
  });
  it('upcoming, full → waitlist', () => {
    const s = athleteState({ ...base, bookedCount: 10, startAt: at(18, 7) }, NOW);
    expect(s.action).toBe('waitlist'); expect(s.full).toBeTrue(); expect(s.spotsLeft).toBe(0);
  });
  it('upcoming, booked → cancel', () => {
    expect(athleteState({ ...base, myBookingStatus: 'BOOKED', startAt: at(18, 7) }, NOW).action).toBe('cancel');
  });
  it('upcoming, waitlisted → leave with position', () => {
    const s = athleteState({ ...base, myBookingStatus: 'WAITLIST', myPosition: 2, startAt: at(18, 7) }, NOW);
    expect(s.mine).toBe('waitlist'); expect(s.position).toBe(2); expect(s.action).toBe('leave');
  });
  it('checked in never offers book or cancel, in any phase', () => {
    for (const startAt of [at(18, 7), at(17, 9), at(16, 9)]) {
      const s = athleteState({ ...base, myBookingStatus: 'CHECKED_IN', startAt }, NOW);
      expect(s.mine).toBe('attended'); expect(s.action).toBeNull();
    }
  });
  it('today, already started → started, no action, spots still known', () => {
    const s = athleteState({ ...base, startAt: at(17, 9) }, NOW);
    expect(s.phase).toBe('started'); expect(s.action).toBeNull(); expect(s.spotsLeft).toBe(7);
  });
  it('booked and started → mine booked, no cancel', () => {
    const s = athleteState({ ...base, myBookingStatus: 'BOOKED', startAt: at(17, 9) }, NOW);
    expect(s.mine).toBe('booked'); expect(s.action).toBeNull();
  });
  it('past day → finished, no action, no spots', () => {
    const s = athleteState({ ...base, startAt: at(16, 20) }, NOW);
    expect(s).toEqual({ phase: 'finished', mine: null, position: null, action: null, spotsLeft: null, full: false });
  });
  it('past day booked → finished + booked', () => {
    expect(athleteState({ ...base, myBookingStatus: 'BOOKED', startAt: at(16, 20) }, NOW).mine).toBe('booked');
  });
  it('overbooked never reports negative spots', () => {
    expect(athleteState({ ...base, bookedCount: 12, startAt: at(18, 7) }, NOW).spotsLeft).toBe(0);
  });
});
```

- [ ] **Step 3: Run Karma — expect FAIL** (module missing).

- [ ] **Step 4: Implement `class-state.ts`:**

```ts
import { SessionView } from './booking.service';
import { isPastDay } from './session-window';

export type Phase = 'finished' | 'started' | 'upcoming';
export type Mine = 'attended' | 'booked' | 'waitlist' | null;
export type Action = 'book' | 'waitlist' | 'cancel' | 'leave' | null;
export interface AthleteState {
  phase: Phase; mine: Mine; position: number | null; action: Action; spotsLeft: number | null; full: boolean;
}

/**
 * Every athlete booking rule in one place (M14c-b, user-ruled 2026-09-16): a past day or a started
 * class offers no action; a past day shows no spots; a checked-in athlete never sees Book or Cancel.
 * Book, class detail and Home all read this, so the rule cannot drift between them.
 */
export function athleteState(
  s: Pick<SessionView, 'startAt' | 'capacity' | 'bookedCount' | 'myBookingStatus' | 'myPosition'>,
  now: Date = new Date(),
): AthleteState {
  const phase: Phase = isPastDay(s.startAt, now) ? 'finished'
    : new Date(s.startAt).getTime() <= now.getTime() ? 'started' : 'upcoming';
  const mine: Mine = s.myBookingStatus === 'CHECKED_IN' ? 'attended'
    : s.myBookingStatus === 'BOOKED' ? 'booked'
    : s.myBookingStatus === 'WAITLIST' ? 'waitlist' : null;
  const full = s.bookedCount >= s.capacity;
  let action: Action = null;
  if (phase === 'upcoming') {
    if (mine === 'booked') action = 'cancel';
    else if (mine === 'waitlist') action = 'leave';
    else if (mine === null) action = full ? 'waitlist' : 'book';
  }
  return {
    phase, mine,
    position: mine === 'waitlist' ? s.myPosition : null,
    action,
    spotsLeft: phase === 'finished' ? null : Math.max(0, s.capacity - s.bookedCount),
    full: phase === 'finished' ? false : full,
  };
}
```

- [ ] **Step 5: `booking-reason.spec.ts`** — one case per code asserting a non-empty string that differs from the fallback, and `bookingReason(undefined)` equals `bookingReason('nonsense')`:

```ts
import { bookingReason } from './booking-reason';

const CODES = ['ENTRIES_TOTAL', 'ENTRIES_PER_MONTH', 'ENTRIES_PER_WEEK', 'ENTRIES_PER_DAY',
  'CANCELLATIONS_TOTAL', 'CANCELLATIONS_PER_MONTH', 'CANCELLATIONS_PER_WEEK', 'CANCELLATIONS_PER_DAY',
  'NO_ACTIVE_SUBSCRIPTION', 'PAST_CUTOFF', 'ALREADY_BOOKED', 'CANCELLED', 'PAST'];

describe('bookingReason', () => {
  const fallback = bookingReason(undefined);
  it('falls back for unknown codes', () => expect(bookingReason('nonsense')).toBe(fallback));
  for (const c of CODES) {
    it(`has its own copy for ${c}`, () => expect(bookingReason(c)).not.toBe(fallback));
  }
  it('gives every code distinct copy', () => expect(new Set(CODES.map(bookingReason)).size).toBe(CODES.length));
});
```

- [ ] **Step 6: Implement `booking-reason.ts`** — `$localize` with explicit ids, plain words, no "weekly class limit" wording for non-weekly rules:

```ts
/** 409 detail from book/cancel → what the athlete reads. One place, shared by Book and class detail. */
export function bookingReason(code: string | undefined): string {
  switch (code) {
    case 'ENTRIES_TOTAL': return $localize`:@@booking.reason.entriesTotal:You've used every class your plan includes for this period.`;
    case 'ENTRIES_PER_MONTH': return $localize`:@@booking.reason.entriesMonth:You've used this month's classes on your plan.`;
    case 'ENTRIES_PER_WEEK': return $localize`:@@booking.reason.entriesWeek:You've used this week's classes on your plan.`;
    case 'ENTRIES_PER_DAY': return $localize`:@@booking.reason.entriesDay:Your plan allows no more classes that day.`;
    case 'CANCELLATIONS_TOTAL': return $localize`:@@booking.reason.cancelTotal:You've used every cancellation your plan allows for this period.`;
    case 'CANCELLATIONS_PER_MONTH': return $localize`:@@booking.reason.cancelMonth:You've used this month's cancellations — talk to your coach.`;
    case 'CANCELLATIONS_PER_WEEK': return $localize`:@@booking.reason.cancelWeek:You've used this week's cancellations — talk to your coach.`;
    case 'CANCELLATIONS_PER_DAY': return $localize`:@@booking.reason.cancelDay:You've used today's cancellations — talk to your coach.`;
    case 'NO_ACTIVE_SUBSCRIPTION': return $localize`:@@booking.reason.noPlan:You need an active plan to book classes.`;
    case 'PAST_CUTOFF': return $localize`:@@booking.reason.pastCutoff:Too late to cancel this class — talk to your coach.`;
    case 'ALREADY_BOOKED': return $localize`:@@booking.reason.alreadyBooked:You're already booked into this class.`;
    case 'CANCELLED': return $localize`:@@booking.reason.cancelled:This class has been cancelled.`;
    case 'PAST': return $localize`:@@booking.reason.past:This class has already started.`;
    default: return $localize`:@@booking.reason.generic:Something went wrong — try again.`;
  }
}
```

- [ ] **Step 7: Update fixtures** found by the grep above with `imagePath: null` / `hasActivePlan: true, attendedThisWeek: [], suggestion: null`.

- [ ] **Step 8: Karma — all green; build — zero warnings.**

---

## Phase C — Screens (per-screen impeccable routine)

Each screen: **shape (orchestrator + user, 3–4 options) → spec §5 updated → build task dispatched with the chosen shape pasted into the brief → user visual sign-off → audit ≥16/20 → fix P0/P1 → critique ≥32/40 in Chrome → user picks fixes → one fix batch.** Shape tasks and gate tasks are orchestrator-only. A build task's markup/CSS comes from the approved shape; its **behaviour contract and tests below are fixed**.

Before any browser pass: `cd /Users/alessandrolomonaco/dev/boxhub/docker && docker compose up -d --build`, then seed past classes with the SQL in `progress.md` (M14c-b notes) **adding `schedule_slot_id` to both SELECTs**.

### Task 6: Shape — class card + Book (orchestrator)

- [ ] Load `impeccable` (shape). Present 3–4 real options for the card and the Book list, grounded in `docs/design-ref/screens/booking-screen-example.webp`, at 360px. Each option states: image ratio, where time/name/coach/meta sit on the scrim, where the badge sits, where the action sits (on the card vs. foot strip), and how a no-image card and a past card look.
- [ ] User picks. Write the decision into spec §3.1 and §5.1; commit docs.

### Task 7: `ui/class-card` + gallery section

**Files:**
- Create: `frontend/src/app/ui/class-card.component.ts`, `class-card.component.spec.ts`
- Modify: `frontend/src/styles/_tokens.scss` (add `--scrim-card: rgba(6, 9, 7, 0.5);` next to `--scrim-text`, with a one-line comment: light scrim for class-card photos, user-ruled 2026-09-17, spec §3.1)
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts` (new `data-gallery="class-card"` section + ledger), `dev-gallery.page.spec.ts` (add `'class-card'` to the exhaustive list)

**Read first:** spec §3.1 (the decided shape, binding) and the reference render `docs/superpowers/sketches/m17a-class-card-a2.html` — the **"A2 · bone ring (law-safe)"** column — with the title treatment "500 · Title case" from `m17a-class-card-title.html`. Match that render; translate every raw value in the sketch to the nearest token (`--fs-h2`, `--fs-sm`, `--fs-meta`, `--sp-*`, `--r-card`, `--r-full`, `--surface`, `--surface-2`, `--hairline`, `--bone`, `--bone-dim`, `--good`, `--warn`, `--scrim-card`). The sketch's `rgba(13,17,14,.86)` chip fill → `--scrim-text`.

**Interfaces:**
- Consumes: `Person` from `features/booking/booking.service.ts` is a FEATURE type — do not import it into `ui/`. Declare the card's own `export interface CardPerson { name: string; avatarPath: string | null; }` in the component file (structurally identical, so pages pass `s.people` directly). Reuse `bh-avatar` (`ui/avatar.component.ts`, `size="sm"` = 28px).
- Produces: `<bh-class-card>` with signal inputs
  `title: string` (required) · `image: string | null` · `coach: string | null` · `coachAvatar: string | null` ·
  `people: readonly CardPerson[]` (default `[]`) · `peopleCount: number` (default 0; the total going) ·
  `emptyText: string | null` (shown when `peopleCount === 0`; null hides the line) ·
  `start: string` (ISO) · `end: string | null` (ISO) · `suffix: string | null` (e.g. "4 left") ·
  `href: string | readonly unknown[] | null` · `tone: 'default' | 'past'` · `testId: string | null`.
  Content slots: `<ng-content select="[badge]">` (top-right on the photo), `<ng-content select="[actions]">` (strip, right), `<ng-content select="[error]">` (below the strip).
  Root is `<article class="class-card" [attr.data-testid]="testId()">`. The photo block and title are inside `<a class="body" [routerLink]="href()">` when `href` is set, a `<div class="body">` otherwise. The strip is OUTSIDE the link (buttons must not nest in an anchor).
  The link's accessible name: title, coach, time range and "N going" — give the anchor an `aria-label` built from those (localized: `$localize\`:@@classCard.aria:${title}:title:, ${time}:time:, ${going}:going:\``, with `going` = `$localize\`:@@classCard.going:${n}:count: going\``), and mark the avatar stack `aria-hidden="true"`.
  `+N` = `peopleCount - people.length` when > 0. Only the first 5 of `people` render.
  Time range rendered with `DatePipe` `'HH:mm'` as `start–end` (en dash), in mono bold; `suffix` follows as ` · {suffix}` in regular `--bone-dim`.
  No image → `--surface-2` block with the title's initials (first letters of the first two words, uppercase) in large `--hairline` type, top-right, `aria-hidden`.
  `tone === 'past'` greyscales the photo only (`filter: grayscale(.85) brightness(.75)` on the image element — never on the badge or text).

- [ ] **Step 1: Write `class-card.component.spec.ts`** with a host component that projects `<span badge>`, `<button actions>` and `<p error>`:

```ts
it('renders the image as a decorative img when given, initials block when not');
it('binds testId on the inner article, not the host');
it('wraps the photo in a link to href and keeps the actions outside the link');
it('renders start–end as HH:mm with the suffix after a middle dot');
it('shows coach name and avatar only when coach is set');
it('renders at most five people and a +N chip for the rest (peopleCount 8, people 6 → 5 avatars, "+3")');
it('shows emptyText when peopleCount is 0 and no stack');
it('projects badge, actions and error');
it('past tone greyscales the image element only');
it('gives the link an aria-label containing title, time and the going count');
```

Write each as a real assertion against the DOM (query selectors, `textContent`, attributes). For "greyscales the image element only": assert the `past` class lands on the image element and not on the article.

- [ ] **Step 2: Run Karma — expect FAIL.**
- [ ] **Step 3: Implement** the component to match the reference column, OnPush, standalone, imports `RouterLink`, `DatePipe`, `AvatarComponent`.
- [ ] **Step 4: Run Karma — PASS.**
- [ ] **Step 5: Gallery section** `data-gallery="class-card"`, rendered at a 360px-wide frame: (1) photo + coach + 8 going + Booked badge + ghost Cancel, (2) no photo + nobody going + solid Book, (3) Full badge + ghost Join waitlist, (4) past tone + Attended badge, no action, (5) a long title + long coach name (ellipsis), (6) an inline error under the strip. Use images already in the repo (`frontend/src/assets` — `ls` it; if none suit, use no-image cards and note it). Ledger: default, hover (link underline/none — declare), focus (hand-checked, the link's focus ring), active, disabled (`na` — a link card has no disabled state; its actions carry their own), loading (`na` — the page renders a stateline, the card has no skeleton), error (rendered, #6). Use the existing ledger template exactly as other sections do.
- [ ] **Step 6: Gates** — Karma green, build zero warnings, and these greps return nothing:
  `grep -nE "@Input|@Output|ChangeDetectionStrategy.Eager|#[0-9a-fA-F]{3,8}\b|rgba?\(|font-size: *[0-9]+px" /Users/alessandrolomonaco/dev/boxhub/frontend/src/app/ui/class-card.component.ts`
  and no backtick inside a comment in the component's template/styles.

### Task 8: Book rebuild

**Files:**
- Modify: `frontend/src/app/features/athlete/book.page.ts`, `book.page.spec.ts`
- Modify e2e locators: `booking-flow.spec.ts:24`, `memberships.spec.ts:103`, `messaging.spec.ts:197`, `schedule.spec.ts:246,314`, `security.spec.ts:33`, `tracking.spec.ts:9,43` — `.card` becomes `[data-testid^="session-"]` (keep `hasText`). Confirm by grep after the change: `grep -rn "locator('.card'" /Users/alessandrolomonaco/dev/boxhub/e2e/tests` → empty.

Behaviour contract:
- Cards are `bh-class-card` with `testId = 'session-' + s.id`, `href = ['/athlete/class', s.id]`, `image = s.imagePath`, `coach = s.coachName`, `coachAvatar = s.coachAvatarPath`, `people = s.people`, `peopleCount = s.bookedCount`, `emptyText` = "No one yet — be the first" (localized) only while upcoming, `tone = 'past'` when finished; `listTemplates()` and `images` are **deleted**.
- Badge, suffix and action come only from `athleteState(s)`. The badge is a CARD INPUT, not projected markup: `[badgeLabel]` (localized string or null) + `[badgeTone]` (`neutral | good | warn`) — ✓ Attended (`good`) / Booked (`neutral`) / Waitlist #n (`neutral`) / Full, upcoming and not mine (`warn`) / null; suffix = "finished" / "started" / "{n} ahead" (waitlisted: position − 1) / "{n} in line" (full, not mine: `s.waitlistCount`) / "{n} left". Buttons: Book = `bh-button variant="solid"` (`testId` `book-btn`), Join waitlist = ghost (`book-btn`), Cancel / Leave waitlist = ghost (`cancel-btn`). Spec §3.1 is binding on all of this.
- A failed action renders `bookingReason(detail)` inside **that card's** `[error]` slot (`role="alert"`, `data-testid="book-error"`), cleared on the next action. The top-of-list error is only for a failed load.
- The in-flight guard lives in the handler (`if (this.busy()) return;`), not only in `[disabled]`.
- Keep: week strip inputs, `sessionWindow`/`covers` effect, `aria-live="polite"` on the list (add it — coach has it), empty state, `tonesOf`.
- All labels `$localize`d; `ChangeDetectionStrategy.Eager` removed (use OnPush; signals already drive it).

Tests (`book.page.spec.ts`, keep the existing past-day cases passing):

```ts
it('renders one class card per session of the selected day, image from imagePath');
it('upcoming with room shows Book; clicking calls booking.book and reloads');
it('full shows Join waitlist with book-btn');
it('checked-in today (not started) shows Attended and neither book-btn nor cancel-btn');
it('a 409 ENTRIES_PER_WEEK renders its copy inside that card only');
it('a second click while busy does not call book twice');
it('past day: Finished, no spots text, no book-btn');
```

- [ ] Steps: tests → FAIL → implement from shape → PASS → Karma + build → e2e locator edits → orchestrator runs `booking-flow`, `tracking`, `schedule` e2e on a `down -v` stack.

### Task 9: Book gate (orchestrator)
- [ ] User visual sign-off (click path: sign in as athlete → dock Book → today, then a past day).
- [ ] `audit` ≥16/20 → fix P0/P1 (executor batch) → `critique` ≥32/40 in Chrome (DEGRADED banner; detector CSP-blocked) → user picks fixes → one batch. Throwaway Playwright spec for 320/360/393 + keyboard, deleted after.

### Task 10: Shape + build — coach Classes (shape part orchestrator)

**Files:** `frontend/src/app/features/coach/classes.page.ts`, `classes.page.spec.ts`; e2e `booking-flow.spec.ts:41`, `library.spec.ts:246`, `programming.spec.ts:22,59` (`.row` → `[data-testid^="class-"]`, keep filters).

- [ ] Shape: repeat of the agreed card with coach actions — orchestrator decides (memory: repeat of an agreed shape is mine), unless the action placement genuinely differs; then 2–3 options to the user.

Behaviour contract:
- `bh-class-card` with `testId = 'class-' + s.id`, `href = ['/coach/classes', s.id, 'checkin']`, meta = `"{booked}/{capacity} booked · {n} in line"` (localized, waitlist part only when > 0), badge = Draft / Published (`$localize`d; Published uses `--good` as today, never volt).
- Actions: Check-in (`checkin-link`) always; Build (`build-link`) and Run (`run-link`) only when `!isPastDay(s.startAt)`.
- Keep header + Announce link, `aria-live="polite"`, error with retry, empty state. Eager removed.

Tests:

```ts
it('past day shows checkin-link only');
it('today shows build-link, checkin-link and run-link');
it('shows Draft vs Published badge from programmingStatus');
it('meta shows the waitlist part only when waitlistCount > 0');
```

- [ ] Steps: tests → FAIL → implement → PASS → Karma + build → e2e locator edits → orchestrator runs `booking-flow`, `library`, `programming`, `runner` e2e.

### Task 11: Coach Classes gate (orchestrator) — as Task 9, signed in as coach.

### Task 12: Shape + build — class detail

**Files:** `frontend/src/app/features/athlete/class-detail.page.ts`, `class-detail.page.spec.ts` (create if absent). Detail's data (`SessionDetail`) lacks `myBookingStatus`/`myPosition`/`bookedCount`: derive them — `mine` from `active`/`queue` entries with `me === true` (`status` CHECKED_IN/BOOKED/WAITLIST; position = 1-based index in `queue`), `bookedCount = active.length`. Build the `athleteState` input from that; **no backend change**.

- [ ] Shape: 3–4 options (hero treatment, where the action sits at 360px relative to the dock, how Finished/Attended read). User picks → spec §5.3.

Behaviour contract:
- One `bh-button variant="strong" size="lg" class="full"` for the action (`testId` `detail-action`), label by action: Book / Join waitlist / Cancel booking / Leave waitlist; none when `action === null` (show the state text instead: Finished / Started HH:mm / You're in).
- After success: reload detail, keep focus on the action (or its replacement text) via `afterNextRender`. Handler-level busy guard.
- Error: `bookingReason(detail)` under the button, `role="alert"`, `data-testid="detail-error"`.
- Load error keeps a way back to Book. Strings `$localize`d; dates via `DatePipe`; Eager removed; `✓ in` becomes a localized, non-colour-only marker.

Tests:

```ts
it('offers Book when not mine and upcoming with room; calls booking.book then reloads');
it('offers Leave waitlist with position when me is in queue');
it('checked-in me: no action button, reads attended');
it('past day: no action button, reads Finished');
it('409 renders bookingReason copy under the button');
```

### Task 13: Class detail gate (orchestrator) — as Task 9; click path Book → card → detail.

### Task 14: Shape + build — Home

**Files:** `frontend/src/app/features/athlete/home.page.ts`, `home.page.spec.ts`.

- [ ] Shape: 3–4 options covering order and treatment of: greeting + date, plan blocker, next-class card (with today's WOD pieces, who's going, log-your-score link), suggestion card / Book prompt, announcement card, attended-days week strip + "N weeks running", last PR and plan days. User picks → spec §5.4.

Behaviour contract:
- Greeting by local hour (morning < 12, afternoon < 18, evening), `$localize`d, with the athlete's first name if the shell/profile service already exposes it (grep; do NOT add a request for it — if unavailable, date only, and report).
- Plan blocker: `!hasActivePlan` → "no active plan" notice linking to `/athlete/membership`; else `planExpiringSoon` → existing expiry copy (localized, pluralised via ICU).
- Next class: `bh-class-card` linking to **`/athlete/class/:sessionId`** (`testId` `next-booking` — e2e `booking-flow.spec.ts:35` uses it), badge Booked / Waitlist #n, participants avatars. If `todayClass().session?.id === nextBooking.sessionId`, render the WOD pieces inside it; if that session has ended (`startAt + durationMin < now`) and any `scoreable && !myScoreLogged` item exists, show a "Log your score" link to `/athlete/wod` (`testId` `log-score-link`).
- No next booking: `suggestion` → card with one-tap Book (`testId` `suggest-book`), calls `booking.book(sessionId)` then reloads home; error via `bookingReason`, inline. No suggestion → Book prompt to `/athlete/book`.
- Announcement card + sheet: behaviour unchanged (existing specs keep passing).
- Week strip: Mon–Sun of the current week, attended days marked (not by colour alone), today outlined; "N weeks running" when `streakWeeks > 0`.
- Last PR and plan days per shape. All strings `$localize`d; Eager removed.

Tests:

```ts
it('next-booking card links to /athlete/class/:id');
it('shows the no-plan notice when hasActivePlan is false');
it('shows the suggestion and books it with one tap');
it('falls back to the Book prompt when there is no suggestion');
it('marks attended days in the week strip');
it('shows Log your score only after today\'s class ended with an unlogged scoreable piece');
```

### Task 15: Home gate (orchestrator) — as Task 9. Seed a habit for athlete@demo.io (past CHECKED_IN bookings on one slot, ≥2) to see the suggestion.

---

## Phase D — Close

### Task 16: e2e wiring spec

**Files:** Create `e2e/tests/athlete-daily.spec.ts`. Read `_support.ts` and `booking-flow.spec.ts` first for login helpers and the `dispatchEvent('click')` pattern.

- [ ] Tests:
  1. Athlete books a class on Book, sees Booked, cancels, sees Book again.
  2. Home's next-class card → **click** → lands on `/athlete/class/:id` showing that class name.
  3. Class detail: Book via `detail-action`, then Cancel booking via the same test id.
  4. Past day (seed through `page.request` with `X-XSRF-TOKEN` like `library.spec.ts`'s `csrfHeaders`, or skip the past-day case if the API offers no way to create a past session — report it): card reads Finished, no `book-btn`.
  5. Coach Classes past day shows `checkin-link` and no `build-link`/`run-link` (same seeding note).
- [ ] Orchestrator runs the FULL e2e suite on a `down -v` stack and `e2e/visual.sh` (new `class-card` baselines).

### Task 17: Close-out (orchestrator)
- [ ] Backlog: strike the M17a entries delivered (pill labels, per-limit reason, `CANCEL_LIMIT_REACHED` copy, card-foot error, home link defect); file anything deferred.
- [ ] Roadmap row 12 → done; rewrite `.superpowers/sdd/NEXT-SESSION.md` for M17b; `progress.md`.
- [ ] Re-run all baselines; `graphify update .`; merge to main and delete the branch.
