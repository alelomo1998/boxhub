# BoxHub M2 — Scheduling & Booking Implementation Plan

> **For agentic workers:** Execution is JUDGMENT-BASED per `CLAUDE.md`. Most tasks are done INLINE by the main thread (write files, run tests, commit). **Task 5 (BookingService engine) is the concurrency risk pocket → one implementer agent + one review.** Steps use `- [ ]` checkboxes.

**Goal:** Athletes book classes with waitlist auto-promotion, cutoff-limited cancellation, and plan weekly-limit enforcement; coaches run rosters and mark attendance; sessions materialize from recurring templates.

**Architecture:** V3 Flyway schema adds `class_templates`, `class_sessions`, `bookings` (all `@TenantId`). A `SessionGenerator` (@Scheduled) materializes sessions to a rolling horizon. `BookingService` owns every booking state transition under a pessimistic session-row lock. Controllers split by role. Frontend adds admin schedule, coach roster, and the athlete booking calendar (first real athlete content) on the design system.

**Tech Stack:** Spring Boot 3.4.1 / Java 21, Postgres 16, Flyway, Testcontainers; Angular 19 standalone + signals + `bh-*` components.

## Global Constraints (from spec + CLAUDE.md)

- Flyway only (V3); never edit applied migrations. `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for backend.
- Tenant ONLY from `TenantContext`; box-scoped endpoints under `/api/box/**` (SCOPE_box). `@TenantId` on box_id for all new tables — **tenant-agnostic queries need NATIVE SQL** (M1 lesson). Every new endpoint: happy + auth-denied + cross-tenant-denied tests.
- Weekday encoding `0=Mon … 6=Sun`. Times stored UTC (`timestamptz`); box timezone for wall-clock + week boundaries.
- Cancel = delete the booking row (not a CANCELLED status); CHECKED_IN/NO_SHOW rows persist. `bookings.status ∈ BOOKED|WAITLIST|CHECKED_IN|NO_SHOW` in practice.
- Plan weekly-limit: Mon–Sun box-tz week; null limit = unlimited; counts BOOKED+CHECKED_IN; waitlist excluded.
- Frontend: tokens only (no raw hex outside `_tokens.scss`), `bh-*` components, dark default. Conventional commits, no `.DS_Store`. Branch `m2-booking`.
- Tests: `cd backend && mvn -q test`; `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`; e2e `cd e2e && npx playwright test`.

---

### Task 1 — V3 migration + Box settings fields  [INLINE]

**Files:** Create `backend/src/main/resources/db/migration/V3__scheduling.sql`; Modify `backend/src/main/java/com/boxhub/box/Box.java`; Modify `backend/src/test/java/com/boxhub/MigrationTest.java`.

**Produces:** tables `class_templates`, `class_sessions`, `bookings`; `boxes.cancel_cutoff_min`, `boxes.booking_horizon_weeks`; `Box.getCancelCutoffMin()/getBookingHorizonWeeks()` (+setters).

- [ ] **Step 1:** Extend `MigrationTest` — add:
```java
    @Test
    void v3AddedSchedulingTables() {
        Integer t = jdbc.queryForObject("""
            select count(*) from information_schema.tables
            where table_name in ('class_templates','class_sessions','bookings')""", Integer.class);
        assertThat(t).isEqualTo(3);
        Integer c = jdbc.queryForObject("""
            select count(*) from information_schema.columns
            where table_name='boxes' and column_name in ('cancel_cutoff_min','booking_horizon_weeks')""", Integer.class);
        assertThat(c).isEqualTo(2);
    }
```
Run `mvn -q test -Dtest=MigrationTest` → FAIL.

- [ ] **Step 2:** Write `V3__scheduling.sql` — exactly the DDL from the spec §2 (boxes alters + three create tables + indexes + constraints).

- [ ] **Step 3:** Add to `Box.java`:
```java
    @Column(name = "cancel_cutoff_min", nullable = false) private int cancelCutoffMin = 120;
    @Column(name = "booking_horizon_weeks", nullable = false) private int bookingHorizonWeeks = 2;
    public int getCancelCutoffMin() { return cancelCutoffMin; }
    public void setCancelCutoffMin(int v) { this.cancelCutoffMin = v; }
    public int getBookingHorizonWeeks() { return bookingHorizonWeeks; }
    public void setBookingHorizonWeeks(int v) { this.bookingHorizonWeeks = v; }
```

- [ ] **Step 4:** `mvn -q test` → all green (existing 53 + migration). **Commit** `feat: V3 schema — class templates, sessions, bookings, box booking settings`.

---

### Task 2 — Entities + repositories  [INLINE]

**Files:** Create `box/ClassTemplate.java`, `box/ClassTemplateRepository.java`, `box/ClassSession.java`, `box/ClassSessionRepository.java`, `box/Booking.java`, `box/BookingRepository.java`. Test `box/SchedulingRepositoryTest.java`.

**Produces (interfaces later tasks rely on):**
- `ClassTemplate` — `@TenantId UUID boxId`; fields name, weekday(int), startTime(LocalTime), durationMin(int), capacity(int), coachId(UUID?), active(boolean); getters/setters; getter-only boxId.
- `ClassSession` — `@TenantId UUID boxId`; templateId(UUID?), name, startAt(Instant), durationMin, capacity, coachId(UUID?), status(String default "SCHEDULED"); getters/setters.
- `Booking` — `@TenantId UUID boxId`; sessionId(UUID), membershipId(UUID), status(String), position(Integer?), bookedAt(Instant), checkedInAt(Instant?); getters/setters.
- `ClassTemplateRepository` — `List<ClassTemplate> findByActiveTrue()`.
- `ClassSessionRepository` — `List<ClassSession> findByStartAtBetweenOrderByStartAt(Instant from, Instant to)`; `Optional<ClassSession> findWithLockById(UUID)` = `@Lock(PESSIMISTIC_WRITE) @Query("select s from ClassSession s where s.id=:id")`.
- `BookingRepository` — `List<Booking> findBySessionId(UUID)`; `Optional<Booking> findBySessionIdAndMembershipId(UUID,UUID)`; `long countBySessionIdAndStatus(UUID,String)`; `List<Booking> findBySessionIdAndStatusOrderByPosition(UUID,String)`; `@Query native for weekly count` (see Task 5).

- [ ] Standard TDD: `SchedulingRepositoryTest` persists a template, a session, a booking under a box-tenant auth context (reuse the `actAsBox` pattern from `TenantIdIsolationTest`), asserts round-trip + `findWithLockById` returns the row. Implement the six entity/repo files (`@TenantId` getter-only boxId, mirroring `Plan`/`Invite`). `mvn -q test`. **Commit** `feat: scheduling entities and repositories`.

---

### Task 3 — Class template CRUD + settings fields  [INLINE]

**Files:** Create `box/ClassTemplateController.java` (`/api/box/class-templates`); Modify `box/BoxController.java` (settings patch + `/api/box/current` gain the two ints). Test `box/ClassTemplateApiTest.java`.

**Produces:** `GET/POST /api/box/class-templates` (POST BOX_ADMIN), `PATCH /api/box/class-templates/{id}` (BOX_ADMIN; edit fields + `active`). `PatchSettingsRequest` + `CurrentBoxResponse` gain `cancelCutoffMin`, `bookingHorizonWeeks`. DTOs validated (`@Min`, weekday 0–6, capacity ≥1). Cross-tenant PATCH → 404. Athlete POST → 403.

- [ ] TDD per M1 patterns (mirror `PlanApiTest`): admin creates/lists/patches a template; athlete 403; cross-tenant 404; invalid weekday/capacity → 400. Settings patch round-trips the two new ints. Implement. `mvn -q test`. **Commit** `feat: class template CRUD and box booking settings`.

---

### Task 4 — Session generation  [INLINE]

**Files:** Create `box/SessionGenerator.java`; Modify `box/ClassTemplateController.java` (invoke on create/reactivate). Test `box/SessionGenerationTest.java`.

**Produces:** `SessionGenerator.generateForBox(UUID boxId, ZoneId tz, int horizonWeeks)` and `generateForTemplate(ClassTemplate, ZoneId, int)` — computes `start_at` instants from weekday+startTime in box tz for each week up to horizon; upserts (skip existing via `(template_id, start_at)` unique — catch `DataIntegrityViolationException` or check-before-insert). A `@Scheduled(cron daily)` `generateAll()` iterating boxes. On template create/reactivate, call `generateForTemplate`.

- [ ] **Test:** `SessionGenerationTest` — create a template (weekday matching a known upcoming date), run generation twice, assert: correct count within horizon (no duplicates on 2nd run), first `start_at` is the next matching weekday at the right wall-clock in box tz, none beyond horizon. Include a box in a DST-adjacent tz (e.g. `Europe/Rome`) and assert the wall-clock time is preserved across the boundary. Implement (use `ZonedDateTime` in box tz → `Instant`). `mvn -q test`. **Commit** `feat: rolling-horizon session generation from templates`.

Note on scheduling: enable `@EnableScheduling` on the application (add to `BoxhubApplication` if absent). Guard the cron bean so it doesn't run in the `test` profile (`@Profile("!test")` on the scheduled method's component, or a property). The unit test calls `generateForBox` directly, not the cron.

---

### Task 5 — BookingService engine + athlete booking endpoints  [AGENT + REVIEW]

**Files:** Create `box/BookingService.java`, `box/BookingController.java`. Modify `box/BookingRepository.java` (weekly-count native query). Test `box/BookingEngineTest.java`, `box/BookingConcurrencyTest.java`.

**Consumes:** entities/repos (Task 2), `Box.getCancelCutoffMin`, `Membership.getPlanId` + `PlanRepository`, `ClassSessionRepository.findWithLockById`, `TenantContext`.

**Produces:**
- `BookingService.book(UUID sessionId, UUID membershipId): Booking` — `@Transactional`. Lock session (`findWithLockById`). Reject (throw `ResponseStatusException` 409 with `reason`) if: session CANCELLED (`CANCELLED`), `start_at` in the past (`PAST`), already has active booking (`ALREADY_BOOKED`), past cutoff (`PAST_CUTOFF`), or weekly limit reached (`LIMIT_REACHED`). If BOOKED count < capacity → status BOOKED; else WAITLIST with `position = (max position for session)+1`. Set `boxId` via TenantContext.requireBoxId().
- `BookingService.cancel(UUID sessionId, UUID membershipId): void` — `@Transactional`. Lock session. Find active booking (404 `NoSuchElementException` if none). If booking is BOOKED and now is within cutoff of start → 409 `PAST_CUTOFF`. Delete booking. If it was BOOKED: promote — find WAITLIST ordered by position; if any, set first to BOOKED + position null, and decrement position of the rest.
- `BookingService.checkIn(UUID bookingId): Booking` / `markNoShow(UUID bookingId): Booking` — set status + checkedInAt (used by Task 6 coach endpoints; put here to keep transitions in one service).
- `BookingRepository` native weekly count:
```java
    @Query(value = """
        select count(*) from bookings b join class_sessions s on s.id = b.session_id
        where b.membership_id = :mid and b.status in ('BOOKED','CHECKED_IN')
          and s.start_at >= :weekStart and s.start_at < :weekEnd""", nativeQuery = true)
    long countInWeek(@Param("mid") UUID membershipId,
                     @Param("weekStart") Instant weekStart, @Param("weekEnd") Instant weekEnd);
```
  Week bounds = Mon 00:00 .. next Mon 00:00 in box tz, converted to Instant, for the target session's local date.
- `BookingController` (athlete, any box role): `POST /api/box/sessions/{id}/book` → 201 `{bookingId, status, position}`; `DELETE /api/box/sessions/{id}/booking` → 204; `GET /api/box/my-bookings?from=` → upcoming bookings with session summary + position. Resolve the caller's membership from `TenantContext.userId()` + box.

**Mandatory tests (this is why it's an agent):**
- `BookingEngineTest` (single-threaded): book fills to capacity then waitlists; cancel BOOKED promotes waitlist #1 and renumbers; cutoff boundary (book/cancel just inside vs outside cutoff); weekly-limit boundary (Nth booking ok, N+1 → 409 LIMIT_REACHED; null limit unlimited; waitlist doesn't count); already-booked 409; past/cancelled session 409; cross-tenant book/cancel → 404 (foreign session invisible).
- `BookingConcurrencyTest`: two threads book the **last** spot concurrently → exactly one BOOKED, one WAITLIST (no oversell); concurrent cancel + book; use `CountDownLatch` + an `ExecutorService`, real Testcontainers Postgres so the `FOR UPDATE` lock actually serializes. Assert `countBySessionIdAndStatus(id,"BOOKED") <= capacity` always.

Dispatch note for the agent: full spec §3 is the contract; return `ResponseStatusException(HttpStatus.CONFLICT, reason)` so `ApiExceptionHandler` renders problem+json; reason codes exactly `CANCELLED|PAST|ALREADY_BOOKED|PAST_CUTOFF|LIMIT_REACHED`. **Commit** `feat: booking engine with waitlist promotion, cutoff and plan-limit enforcement`.

---

### Task 6 — Session coach endpoints + no-show sweep  [INLINE]

**Files:** Create `box/SessionController.java`. Modify `box/BookingService.java` only if a sweep helper is cleaner there. Test `box/SessionApiTest.java`.

**Produces:**
- `GET /api/box/sessions?from=&to=` (any box role) → sessions in range with `{id,name,startAt,durationMin,capacity,coachId,status, bookedCount, waitlistCount, myBookingStatus?, myPosition?}` (caller state from their membership).
- `PATCH /api/box/sessions/{id}` (COACH/BOX_ADMIN) → edit capacity/coachId/startAt or `status=CANCELLED`. Cancelling a session leaves bookings (they're moot); do not oversell on capacity increase (fine) — capacity decrease does not auto-bump already-booked (M2: allowed, flagged over-capacity only visually).
- `GET /api/box/sessions/{id}/roster` (COACH/BOX_ADMIN) → booked + waitlist with athlete name/email + status + position.
- `POST /api/box/sessions/{id}/checkin` `{bookingId}` / `POST …/no-show` `{bookingId}` (COACH/BOX_ADMIN) → delegate to `BookingService.checkIn/markNoShow`.
- No-show sweep: `@Scheduled` nightly (`@Profile("!test")`) → for sessions whose `start_at` is in the past, set remaining BOOKED → NO_SHOW. Expose `BookingService.sweepNoShows(Instant before)` for a direct unit test.

- [ ] TDD: coach lists sessions with counts; roster shows booked+waitlist; check-in flips status; cross-tenant roster/checkin → 404; athlete calling checkin → 403; `sweepNoShows` flips past BOOKED → NO_SHOW but not CHECKED_IN. `mvn -q test` (full backend green). **Commit** `feat: coach session management, roster, check-in, no-show sweep`.

---

### Task 7 — Frontend booking service + models  [INLINE]

**Files:** Create `frontend/src/app/features/booking/booking.service.ts`. Test `booking.service.spec.ts`.

**Produces:** `BookingService` (frontend) typed methods: `listSessions(from,to): Observable<SessionView[]>`, `book(sessionId): Observable<BookingResult>`, `cancel(sessionId): Observable<void>`, `myBookings(from): Observable<MyBooking[]>`, `roster(sessionId): Observable<RosterEntry[]>`, `checkIn(sessionId,bookingId)`, `noShow(sessionId,bookingId)`, `listTemplates()/createTemplate()/patchTemplate()`, `patchSession()`. Models mirror backend DTOs (SessionView with bookedCount/capacity/myBookingStatus/myPosition, etc.). One spec asserting `listSessions` params + `book` POST.

- [ ] Implement + spec. `npm test` + `npm run build`. **Commit** `feat: frontend booking service`.

---

### Task 8 — Athlete booking calendar + my-bookings  [INLINE]

**Files:** Modify `frontend/src/app/features/athlete/athlete-shell.page.ts` → real content (nav to booking + my-bookings); Create `athlete/book.page.ts`, `athlete/my-bookings.page.ts`; Modify `app.routes.ts` (athlete children).

**Produces:** athlete shell with rail (Book / My bookings) + theme toggle; **Book** page = upcoming sessions grouped by day, each showing time/name/coach and a spots indicator (`bh-pill`: open spots / "Full · waitlist" / "Booked" / "Waitlisted #n") with a `bh-button` Book/Cancel; weekly-limit 409 shows an inline message. **My bookings** = upcoming list with waitlist position + cancel. All `bh-*` + tokens, testids `session-<id>`, `book-btn`, `cancel-btn`, `book-error`.

- [ ] Implement. `npm test` + `npm run build`. **Commit** `feat: athlete booking calendar and my-bookings`.

---

### Task 9 — Admin schedule (templates + sessions)  [INLINE]

**Files:** Create `admin/schedule.page.ts`; Modify `admin/admin-shell.page.ts` (add "Schedule" nav) + `app.routes.ts`.

**Produces:** Schedule page = template list + create/edit form (name, weekday select, start time, duration, capacity, coach optional) using `bh-*`; below, a week view of generated sessions with edit/cancel. Testids `template-name`, `template-create`, `template-weekday`, `session-<id>`, `session-cancel`.

- [ ] Implement. `npm test` + `npm run build`. **Commit** `feat: admin schedule management`.

---

### Task 10 — Coach roster + check-in  [INLINE]

**Files:** Modify `coach/coach-shell.page.ts` → real content; Create `coach/sessions.page.ts` (today/upcoming sessions), `coach/roster.page.ts`; Modify `app.routes.ts`.

**Produces:** coach shell rail (Sessions) + theme toggle; Sessions page lists upcoming with booked/capacity; Roster page = booked list (tap → check-in, `bh-pill` status) + waitlist list; testids `roster-<bookingId>`, `checkin-btn`, `noshow-btn`.

- [ ] Implement. `npm test` + `npm run build`. **Commit** `feat: coach sessions and roster check-in`.

---

### Task 11 — E2E acceptance flow + docs  [INLINE]

**Files:** Create `e2e/tests/booking-flow.spec.ts`; Modify `README.md`.

**Produces:** the M2 acceptance e2e against a rebuilt compose stack — seed/create a session with capacity 1; athlete A books (BOOKED); athlete B books (WAITLIST #1); A cancels (before cutoff) → B auto-promoted to BOOKED; coach opens roster, checks B in. Uses the dev-seeded users + an admin-created template/session (or a direct session create). README gains a booking section.

- [ ] Rebuild stack, write spec, `npx playwright test` (with configured retries) → green incl. existing suites. `docker compose down`. **Commit** `test: e2e booking waitlist-promotion flow; docs`.

---

## Spec coverage check
- §1 decisions 1–8 → Tasks 4 (gen), 5 (waitlist/cutoff/limit), 6 (check-in/roles), 2/3 (members-only, no tracks). ✓
- §2 data model → Task 1/2. §3 engine → Task 5. §4 generation → Task 4. §5 endpoints → Tasks 3/5/6. §6 frontend → Tasks 7–10. §7 tests → each task + Task 11. §8 DoD → Task 11 + full suite. ✓
- Concurrency/oversell → Task 5 `BookingConcurrencyTest` (agent). Box-tz week + DST → Tasks 4, 5 tests. Cross-tenant denial → every backend task. ✓

## Execution
Tasks 1–4, 6–11 INLINE (main thread). Task 5 = one implementer agent (full §3 contract in dispatch) + one review (concurrency correctness, no oversell, reason codes, cross-tenant). Branch `m2-booking`; merge to main at DoD.
