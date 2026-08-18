# M14a — Class & Programming Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the class model into `class_type` × `schedule_slot`, give a programming piece three independent axes (macro, timing, score), let a class own its programming content, and make a cancellation a fact instead of a deletion — all in schema and domain, with no new API surface.

**Architecture:** Three Flyway migrations, each with its own task and its own test: V19 splits the class model, V20 restructures the programming vocabulary and content, V21 converts cancellation from delete to status. Entities and domain services follow each migration. Existing controllers are edited only far enough to keep the build and suite green.

**Tech Stack:** Spring Boot 3.5 / Java 21, Hibernate 6 with `@TenantId` discriminator multi-tenancy, Postgres 16, Flyway, JUnit 5 + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-18-m14a-class-programming-model-design.md`

## Global Constraints

- **Build env:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` for every backend command. The system JDK is 26 and is too new.
- **Test command:** `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
- **Schema changes only via Flyway.** Never edit an applied migration. `V18__locale.sql` is the last applied; V19, V20, V21 are free and are claimed by this plan in that order.
- **Tenancy:** resolve tenant ONLY from the JWT via `TenantContext`, never from request params. `@TenantId` entities need NATIVE SQL for any tenant-agnostic query — JPQL and derived queries are silently filtered to the caller's box. Authority: `docs/TENANCY.md`.
- **`AuthzConformanceTest` must pass with NO edit to it.** This milestone adds no route. An edit to that file means scope has leaked — stop and escalate to the orchestrator.
- **No new endpoints, no new DTOs, no screens.** Controller edits are keep-it-compiling only.
- **Every box-scoped endpoint keeps happy + auth-denied + cross-tenant-denied tests.**
- **Mail fires strictly AFTER commit; an audit row is written strictly INSIDE the transaction.**
- **No production data exists.** The product has never been deployed. Migrations transform dev data; no careful backfill strategy is required. V7 set this precedent explicitly in its own header comment.
- Conventional commits.
- **Executors never guess.** Blocked, ambiguous, or plan-conflicts-with-reality → return the question to the orchestrator rather than improvising.

---

## File Structure

**Created:**
- `backend/src/main/resources/db/migration/V19__class_type_schedule_slot.sql` — the class model split
- `backend/src/main/resources/db/migration/V20__programming_axes.sql` — macro/timing/score axes, library flag
- `backend/src/main/resources/db/migration/V21__booking_cancellation.sql` — soft cancel + partial index
- `backend/src/main/java/com/boxhub/box/ClassType.java` — class identity (name, image); owns the skeleton
- `backend/src/main/java/com/boxhub/box/ClassTypeRepository.java`
- `backend/src/main/java/com/boxhub/box/ScheduleSlot.java` — when a class runs, plus the values a session snapshots
- `backend/src/main/java/com/boxhub/box/ScheduleSlotRepository.java`
- `backend/src/main/java/com/boxhub/programming/Macros.java` — the fixed four-value macro vocabulary
- `backend/src/main/java/com/boxhub/programming/TimingPresets.java` — preset vocabulary
- `backend/src/main/java/com/boxhub/programming/WodJsonValidator.java` — depth-2 cap on `blocks_json`, segment validation on `timing_json`
- `backend/src/main/java/com/boxhub/box/SlotRegenerationService.java` — regenerate forward, refusing ranges that hold bookings
- Test files named per task

**Deleted:**
- `backend/src/main/java/com/boxhub/box/ClassTemplate.java`
- `backend/src/main/java/com/boxhub/box/ClassTemplateRepository.java`
- `PieceTypes.defaultScoreType()` (the class survives only if `ALL` still has a consumer; if not, delete the class)

**Modified:** `ClassSession`, `SessionGenerator`, `ClassTemplateController`, `HomeController`, `SessionDetailController`, `MyClassController`, `SkeletonController`, `DevDataSeeder`, `TemplatePiece`, `Wod`, `WodJson`, `WodService`, `SessionItem`, `SessionItemController`, `BookingService`, `Booking`.

**Measured blast radius:** 9 main files reference `ClassTemplate`; 6 test files touch `ClassTemplate`, `PieceTypes` or `defaultScoreType`; `defaultScoreType` has exactly one caller, `SessionItemController:53`.

---

## Task 1: V19 — split `class_templates` into `class_type` × `schedule_slot`

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__class_type_schedule_slot.sql`
- Test: `backend/src/test/java/com/boxhub/box/ClassModelSplitMigrationTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `class_type(id, box_id, name, image_path, created_at)` and `schedule_slot(id, box_id, class_type_id, weekday, start_time, duration_min, capacity, coach_id, active)`. `template_piece.class_type_id` replaces `template_piece.template_id`. `class_sessions.schedule_slot_id` replaces `class_sessions.template_id`. `class_templates` no longer exists.

- [ ] **Step 1: Write the migration**

```sql
-- M14a: class identity splits from its weekly slot. class_templates held both, which is why no page
-- can describe a class and no class can be scheduled twice. No production deployment exists (see V7),
-- so this transforms dev data in place rather than carrying a backfill strategy.

create table class_type (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes(id),
    name       text not null,
    image_path text,
    created_at timestamptz not null default now(),
    unique (box_id, name)
);
create index idx_class_type_box on class_type (box_id);

create table schedule_slot (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    class_type_id uuid not null references class_type(id) on delete cascade,
    weekday       int  not null check (weekday between 0 and 6),
    start_time    time not null,
    duration_min  int  not null check (duration_min > 0),
    capacity      int  not null check (capacity > 0),
    coach_id      uuid references users(id),
    active        boolean not null default true
);
create index idx_slot_box_active on schedule_slot (box_id, active);

-- one class_type per distinct (box, name); image_path takes an arbitrary member's value
insert into class_type (box_id, name, image_path)
select box_id, name, min(image_path)
from class_templates
group by box_id, name;

-- one slot per existing template row
insert into schedule_slot (id, box_id, class_type_id, weekday, start_time, duration_min, capacity, coach_id, active)
select t.id, t.box_id, ct.id, t.weekday, t.start_time, t.duration_min, t.capacity, t.coach_id, t.active
from class_templates t
join class_type ct on ct.box_id = t.box_id and ct.name = t.name;

-- template_piece belongs to the class type, not to a slot
alter table template_piece add column class_type_id uuid references class_type(id) on delete cascade;
update template_piece tp
set class_type_id = ss.class_type_id
from schedule_slot ss
where ss.id = tp.template_id;
alter table template_piece alter column class_type_id set not null;
alter table template_piece drop constraint template_piece_box_id_template_id_sort_order_key;
alter table template_piece drop column template_id;
alter table template_piece add unique (box_id, class_type_id, sort_order);

-- class_sessions points at the slot it was generated from; it remains a SNAPSHOT of the rest
alter table class_sessions rename column template_id to schedule_slot_id;
alter table class_sessions
    add constraint class_sessions_schedule_slot_id_fkey
    foreign key (schedule_slot_id) references schedule_slot(id) on delete set null;

drop table class_templates;
```

> **Executor note:** `schedule_slot.id` deliberately reuses `class_templates.id` so that the existing
> `class_sessions.template_id` values stay valid and need no remapping. Do not let this become a
> `gen_random_uuid()`. If the insert fails on a constraint, STOP and escalate — do not drop the
> constraint to make it pass.
>
> The dropped `template_piece` unique constraint name is Postgres's generated default for
> `unique (box_id, template_id, sort_order)` in V7. **Verify the real name first** with
> `\d template_piece` against a migrated dev database, and use what you find. Do not assume.

- [ ] **Step 2: Write the failing migration test**

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ClassModelSplitMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void classTemplatesIsGoneAndItsDataLivesInTypeAndSlot() {
        Integer templatesLeft = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'class_templates'",
                Integer.class);
        assertThat(templatesLeft).isZero();

        Integer slots = jdbc.queryForObject("select count(*) from schedule_slot", Integer.class);
        assertThat(slots).isPositive();

        // every slot resolves to a class type in the same box
        Integer orphans = jdbc.queryForObject("""
                select count(*) from schedule_slot ss
                left join class_type ct on ct.id = ss.class_type_id and ct.box_id = ss.box_id
                where ct.id is null
                """, Integer.class);
        assertThat(orphans).isZero();
    }

    @Test
    void sessionsStillPointAtTheSlotTheyCameFrom() {
        Integer dangling = jdbc.queryForObject("""
                select count(*) from class_sessions cs
                where cs.schedule_slot_id is not null
                  and not exists (select 1 from schedule_slot ss where ss.id = cs.schedule_slot_id)
                """, Integer.class);
        assertThat(dangling).isZero();
    }

    @Test
    void skeletonPiecesHangOffTheClassType() {
        Integer dangling = jdbc.queryForObject("""
                select count(*) from template_piece tp
                where not exists (select 1 from class_type ct where ct.id = tp.class_type_id)
                """, Integer.class);
        assertThat(dangling).isZero();
    }
}
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassModelSplitMigrationTest`
Expected: FAIL — the migration does not exist yet, so `schedule_slot` is missing and the query errors.

- [ ] **Step 4: Add the migration file and re-run**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassModelSplitMigrationTest`
Expected: PASS.

> The build will NOT compile at this point if entities still map `class_templates`. That is expected —
> Task 2 fixes it. If the suite cannot start, verify the migration alone via the single-test run above
> and proceed; do not "fix" it by keeping the old table.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V19__class_type_schedule_slot.sql \
        backend/src/test/java/com/boxhub/box/ClassModelSplitMigrationTest.java
git commit -m "feat(m14a): split class_templates into class_type and schedule_slot (V19)"
```

---

## Task 2: `ClassType` and `ScheduleSlot` entities, `ClassTemplate` deleted

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/ClassType.java`, `ClassTypeRepository.java`, `ScheduleSlot.java`, `ScheduleSlotRepository.java`
- Delete: `backend/src/main/java/com/boxhub/box/ClassTemplate.java`, `ClassTemplateRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/ClassSession.java`, `backend/src/main/java/com/boxhub/programming/TemplatePiece.java`
- Test: `backend/src/test/java/com/boxhub/box/ClassTypeSlotSchemaTest.java`

**Interfaces:**
- Consumes: Task 1's tables.
- Produces: `ClassType` with `getId/getBoxId/getName/setName/getImagePath/setImagePath`. `ScheduleSlot` with `getId/getBoxId/getClassTypeId/setClassTypeId/getWeekday/setWeekday/getStartTime/setStartTime/getDurationMin/setDurationMin/getCapacity/setCapacity/getCoachId/setCoachId/isActive/setActive`. `ScheduleSlotRepository.findByActiveTrue()` returns `List<ScheduleSlot>`. `ClassSession.getScheduleSlotId()/setScheduleSlotId(UUID)` replaces the template pair. `TemplatePiece.getClassTypeId()/setClassTypeId(UUID)` replaces the template pair.

- [ ] **Step 1: Write the failing schema test**

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ClassTypeSlotSchemaTest extends AbstractIntegrationTest {

    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;

    @Test
    void aTypeMayExistWithZeroSlots() {          // spec decision 12
        UUID boxId = seedBoxAndAuthenticate();   // existing helper on AbstractIntegrationTest
        ClassType t = new ClassType();
        t.setName("Barbell Club");
        types.save(t);

        assertThat(types.findById(t.getId())).isPresent();
        assertThat(slots.findByActiveTrue().stream().anyMatch(s -> s.getClassTypeId().equals(t.getId())))
                .isFalse();
    }

    @Test
    void aSlotCarriesItsOwnDurationCapacityAndCoach() {   // spec decision 2
        seedBoxAndAuthenticate();
        ClassType t = new ClassType();
        t.setName("WOD");
        types.save(t);

        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(t.getId());
        s.setWeekday(0);
        s.setStartTime(LocalTime.of(6, 0));
        s.setDurationMin(60);
        s.setCapacity(12);
        slots.save(s);

        ScheduleSlot found = slots.findById(s.getId()).orElseThrow();
        assertThat(found.getDurationMin()).isEqualTo(60);
        assertThat(found.getCapacity()).isEqualTo(12);
    }
}
```

> **Executor note:** `seedBoxAndAuthenticate()` is illustrative. **Open `AbstractIntegrationTest` and
> use the real helper it provides** for establishing a box tenant. Do not invent one, and do not set
> the tenant from a request param — `@TenantId` resolves from the JWT only.

- [ ] **Step 2: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassTypeSlotSchemaTest`
Expected: FAIL — `ClassType` does not exist.

- [ ] **Step 3: Write the entities**

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** A class the box offers: identity plus its skeleton. When it runs lives on ScheduleSlot. */
@Entity
@Table(name = "class_type")
public class ClassType {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String name;
    @Column(name = "image_path") private String imagePath;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getImagePath() { return imagePath; }
    public void setImagePath(String imagePath) { this.imagePath = imagePath; }
    public Instant getCreatedAt() { return createdAt; }
}
```

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.LocalTime;
import java.util.UUID;

/**
 * One weekly occurrence of a ClassType. Owns duration, capacity and coach OUTRIGHT — there are no
 * type-level defaults and no override resolution (spec decision 2). A ClassSession snapshots
 * straight from here.
 */
@Entity
@Table(name = "schedule_slot")
public class ScheduleSlot {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "class_type_id", nullable = false) private UUID classTypeId;
    @Column(nullable = false) private int weekday;               // 0=Mon .. 6=Sun
    @Column(name = "start_time", nullable = false) private LocalTime startTime;
    @Column(name = "duration_min", nullable = false) private int durationMin;
    @Column(nullable = false) private int capacity;
    @Column(name = "coach_id") private UUID coachId;
    @Column(nullable = false) private boolean active = true;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getClassTypeId() { return classTypeId; }
    public void setClassTypeId(UUID classTypeId) { this.classTypeId = classTypeId; }
    public int getWeekday() { return weekday; }
    public void setWeekday(int weekday) { this.weekday = weekday; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public int getDurationMin() { return durationMin; }
    public void setDurationMin(int durationMin) { this.durationMin = durationMin; }
    public int getCapacity() { return capacity; }
    public void setCapacity(int capacity) { this.capacity = capacity; }
    public UUID getCoachId() { return coachId; }
    public void setCoachId(UUID coachId) { this.coachId = coachId; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
```

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ClassTypeRepository extends JpaRepository<ClassType, UUID> {
    List<ClassType> findAllByOrderByName();
}
```

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ScheduleSlotRepository extends JpaRepository<ScheduleSlot, UUID> {
    List<ScheduleSlot> findByActiveTrue();
    List<ScheduleSlot> findByClassTypeId(UUID classTypeId);
}
```

- [ ] **Step 4: Rename the fields on `ClassSession` and `TemplatePiece`**

In `ClassSession.java`: `templateId` → `scheduleSlotId`, column `template_id` → `schedule_slot_id`, and rename `getTemplateId`/`setTemplateId` to `getScheduleSlotId`/`setScheduleSlotId`.

In `TemplatePiece.java`: `templateId` → `classTypeId`, column `template_id` → `class_type_id`, and rename the accessors to `getClassTypeId`/`setClassTypeId`.

- [ ] **Step 5: Delete `ClassTemplate.java` and `ClassTemplateRepository.java`**

```bash
git rm backend/src/main/java/com/boxhub/box/ClassTemplate.java \
       backend/src/main/java/com/boxhub/box/ClassTemplateRepository.java
```

The build will now fail in the 7 remaining call sites. Tasks 3 and 4 fix them. Do not stub the deleted class to make the build pass.

- [ ] **Step 6: Run the schema test**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassTypeSlotSchemaTest`
Expected: PASS once Tasks 3–4 land. If the module will not compile, complete Tasks 3 and 4 before re-running, and commit this task's files as-is.

- [ ] **Step 7: Commit**

```bash
git add -A backend/src/main/java/com/boxhub/box backend/src/main/java/com/boxhub/programming/TemplatePiece.java \
        backend/src/test/java/com/boxhub/box/ClassTypeSlotSchemaTest.java
git commit -m "feat(m14a): ClassType and ScheduleSlot entities, ClassTemplate deleted"
```

---

## Task 3: `SessionGenerator` generates from slots

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/SessionGenerator.java`
- Modify: `backend/src/main/java/com/boxhub/box/ClassSessionRepository.java`
- Test: `backend/src/test/java/com/boxhub/box/SessionGeneratorSlotTest.java`

**Interfaces:**
- Consumes: `ScheduleSlotRepository.findByActiveTrue()`, `ClassTypeRepository`, `ClassSession.setScheduleSlotId(UUID)`.
- Produces: `SessionGenerator.generateForSlot(ScheduleSlot slot, ClassType type, ZoneId tz, int horizonWeeks)` replacing `generateForTemplate`. `ClassSessionRepository.existsByScheduleSlotIdAndStartAt(UUID, Instant)` replacing `existsByTemplateIdAndStartAt`.

- [ ] **Step 1: Write the failing test**

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SessionGeneratorSlotTest extends AbstractIntegrationTest {

    @Autowired SessionGenerator generator;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired ClassSessionRepository sessions;

    @Test
    void generatedSessionsSnapshotTheSlotAndNameTheType() {
        UUID boxId = seedBoxAndAuthenticate();

        ClassType t = new ClassType();
        t.setName("Metcon");
        types.save(t);

        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(t.getId());
        s.setWeekday(2);
        s.setStartTime(LocalTime.of(18, 0));
        s.setDurationMin(45);
        s.setCapacity(14);
        slots.save(s);

        generator.generateForBox(boxId);

        var generated = sessions.findAll().stream()
                .filter(cs -> s.getId().equals(cs.getScheduleSlotId()))
                .toList();

        assertThat(generated).isNotEmpty();
        assertThat(generated).allSatisfy(cs -> {
            assertThat(cs.getName()).isEqualTo("Metcon");     // name comes from the TYPE
            assertThat(cs.getDurationMin()).isEqualTo(45);    // numbers come from the SLOT
            assertThat(cs.getCapacity()).isEqualTo(14);
        });
    }

    @Test
    void generationIsIdempotent() {
        UUID boxId = seedBoxAndAuthenticate();
        ClassType t = new ClassType(); t.setName("Open Gym"); types.save(t);
        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(t.getId()); s.setWeekday(4); s.setStartTime(LocalTime.of(7, 0));
        s.setDurationMin(60); s.setCapacity(20); slots.save(s);

        generator.generateForBox(boxId);
        long first = sessions.count();
        generator.generateForBox(boxId);

        assertThat(sessions.count()).isEqualTo(first);
    }
}
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=SessionGeneratorSlotTest`
Expected: FAIL — `generateForBox` still iterates templates.

- [ ] **Step 3: Rewrite the generator's loop**

Replace the body of `generateForBox` and `generateForTemplate`:

```java
    public void generateForBox(UUID boxId) {
        Box box = boxes.findById(boxId).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        int horizonWeeks = box.getBookingHorizonWeeks();
        runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            for (ScheduleSlot slot : slots.findByActiveTrue()) {
                ClassType type = types.findById(slot.getClassTypeId()).orElseThrow();
                generateForSlot(slot, type, tz, horizonWeeks);
            }
        }));
    }

    /** Assumes the current tenant is the slot's box (create path sets it; generateForBox sets it). */
    public void generateForSlot(ScheduleSlot slot, ClassType type, ZoneId tz, int horizonWeeks) {
        DayOfWeek target = DayOfWeek.of(slot.getWeekday() + 1); // 0=Mon -> MONDAY(1)
        LocalDate today = LocalDate.now(tz);
        LocalDate end = today.plusWeeks(horizonWeeks);
        for (LocalDate d = today; !d.isAfter(end); d = d.plusDays(1)) {
            if (d.getDayOfWeek() != target) continue;
            Instant startAt = ZonedDateTime.of(d, slot.getStartTime(), tz).toInstant();
            if (startAt.isBefore(Instant.now())) continue;                             // no past slots
            if (sessions.existsByScheduleSlotIdAndStartAt(slot.getId(), startAt)) continue; // idempotent
            ClassSession s = new ClassSession();
            s.setScheduleSlotId(slot.getId());
            s.setName(type.getName());          // identity from the type
            s.setStartAt(startAt);
            s.setDurationMin(slot.getDurationMin());   // numbers snapshot from the slot
            s.setCapacity(slot.getCapacity());
            s.setCoachId(slot.getCoachId());
            sessions.save(s);
        }
    }
```

Swap the constructor's `ClassTemplateRepository templates` for `ScheduleSlotRepository slots` and `ClassTypeRepository types`, and update the fields. Rename `existsByTemplateIdAndStartAt` to `existsByScheduleSlotIdAndStartAt` in `ClassSessionRepository`.

> Keep `runAsBox` exactly as it is. It exists because the tenant must be established BEFORE the
> Hibernate session opens or `@TenantId` resolves to the NO_TENANT sentinel. Do not move it inside
> the transaction, and do not replace it with a parameter.

- [ ] **Step 4: Run the test**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=SessionGeneratorSlotTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/box/SessionGenerator.java \
        backend/src/main/java/com/boxhub/box/ClassSessionRepository.java \
        backend/src/test/java/com/boxhub/box/SessionGeneratorSlotTest.java
git commit -m "feat(m14a): generate sessions from schedule slots"
```

---

## Task 4: Repoint the remaining call sites

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/ClassTemplateController.java`, `HomeController.java`, `SessionDetailController.java`
- Modify: `backend/src/main/java/com/boxhub/programming/MyClassController.java`, `SkeletonController.java`
- Modify: `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java`
- Modify: the 6 test files that reference `ClassTemplate`

**Interfaces:**
- Consumes: everything produced by Tasks 2 and 3.
- Produces: a compiling module with the full suite green.

- [ ] **Step 1: Find every remaining reference**

Run: `cd backend && grep -rn "ClassTemplate" src/`
Expected: a finite list. Work through it file by file.

- [ ] **Step 2: Repoint each call site**

Mechanical substitution in every case:
- `ClassTemplateRepository` → `ScheduleSlotRepository` (+ `ClassTypeRepository` wherever the *name* or *image* is read, since those moved to the type)
- `ClassTemplate t` → `ScheduleSlot slot` plus a `ClassType` lookup for `getName()`/`getImagePath()`
- `t.getId()` used as a session's origin → `slot.getId()`
- `session.getTemplateId()` → `session.getScheduleSlotId()`
- `piece.getTemplateId()` → `piece.getClassTypeId()`

> **This is the task most likely to hide a real decision behind a mechanical edit.** `ClassTemplateController`
> exposes a request/response shape that now spans two entities. **Do NOT redesign it** — keep the existing
> JSON contract by composing type + slot into the same fields it already returns. If a field cannot be
> preserved without inventing API surface, STOP and escalate to the orchestrator. Redesigning that
> contract is M14b's work, not this milestone's.
>
> `DevDataSeeder` must create a `ClassType` and its `ScheduleSlot`s, not one row per class. Seeded
> classes that previously appeared twice a week should now be ONE type with TWO slots — that is the
> whole point of the split, and the seeder is the first place it is visible.

- [ ] **Step 3: Run the full backend suite**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
Expected: PASS, all green. `AuthzConformanceTest` must pass with no edit to it.

- [ ] **Step 4: Commit**

```bash
git add -A backend/src
git commit -m "refactor(m14a): repoint call sites from ClassTemplate to ClassType + ScheduleSlot"
```

---

## Task 5: V20 — three axes on `wod` and `template_piece`

**Files:**
- Create: `backend/src/main/resources/db/migration/V20__programming_axes.sql`
- Create: `backend/src/main/java/com/boxhub/programming/Macros.java`, `TimingPresets.java`
- Modify: `backend/src/main/java/com/boxhub/programming/Wod.java`, `TemplatePiece.java`
- Test: `backend/src/test/java/com/boxhub/programming/ProgrammingAxesMigrationTest.java`

**Interfaces:**
- Consumes: Task 1's `template_piece.class_type_id`.
- Produces: `wod.macro`, `wod.timing_preset`, `wod.timing_json`, `wod.library`; `template_piece.macro`, `template_piece.timing_preset`. `Macros.ALL` = `{"WARMUP","STRENGTH","GYMNASTIC","WORKOUT"}`. `TimingPresets.ALL` = `{"FOR_TIME","AMRAP","EMOM","TABATA","INTERVAL"}`. `Wod.getMacro/setMacro`, `getTimingPreset/setTimingPreset`, `getTimingJson/setTimingJson`, `isLibrary/setLibrary`.

- [ ] **Step 1: Write the migration**

```sql
-- M14a: a piece has three independent axes — macro (what part of class), timing (how it runs),
-- score (how it is measured). wod_type was one flat list mixing the first two, with no TABATA at all.

alter table wod add column macro          text;
alter table wod add column timing_preset  text;
alter table wod add column timing_json    jsonb not null default '{"rounds":1,"segments":[]}'::jsonb;
alter table wod add column library        boolean not null default false;

alter table template_piece add column macro         text;
alter table template_piece add column timing_preset text;

-- vocabulary migration, identical for both tables
update wod set
    macro = case wod_type
        when 'WARMUP'   then 'WARMUP'
        when 'STRENGTH' then 'STRENGTH'
        when 'SKILL'    then 'GYMNASTIC'
        else 'WORKOUT'                       -- CIRCUIT, CUSTOM, FOR_TIME, AMRAP, EMOM, INTERVAL
    end,
    timing_preset = case wod_type
        when 'FOR_TIME' then 'FOR_TIME'
        when 'AMRAP'    then 'AMRAP'
        when 'EMOM'     then 'EMOM'
        when 'INTERVAL' then 'INTERVAL'
        else null
    end;

update template_piece set
    macro = case wod_type
        when 'WARMUP'   then 'WARMUP'
        when 'STRENGTH' then 'STRENGTH'
        when 'SKILL'    then 'GYMNASTIC'
        else 'WORKOUT'
    end,
    timing_preset = case wod_type
        when 'FOR_TIME' then 'FOR_TIME'
        when 'AMRAP'    then 'AMRAP'
        when 'EMOM'     then 'EMOM'
        when 'INTERVAL' then 'INTERVAL'
        else null
    end;

-- everything already in the table IS the library; nothing has been attached by copy yet
update wod set library = true;

alter table wod alter column macro set not null;
alter table template_piece alter column macro set not null;

alter table wod drop constraint wod_wod_type_check;   -- created in V7
alter table wod drop column wod_type;
alter table template_piece drop column wod_type;

alter table wod add constraint wod_macro_check
    check (macro in ('WARMUP','STRENGTH','GYMNASTIC','WORKOUT'));
alter table wod add constraint wod_timing_preset_check
    check (timing_preset is null or timing_preset in ('FOR_TIME','AMRAP','EMOM','TABATA','INTERVAL'));
alter table template_piece add constraint template_piece_macro_check
    check (macro in ('WARMUP','STRENGTH','GYMNASTIC','WORKOUT'));
alter table template_piece add constraint template_piece_timing_preset_check
    check (timing_preset is null or timing_preset in ('FOR_TIME','AMRAP','EMOM','TABATA','INTERVAL'));

create index idx_wod_library on wod (box_id, library);
```

> **Executor note:** `time_cap_seconds` STAYS. It has live consumers — `WodService`, `WodController`'s
> DTOs, `wod-builder.page.ts`, and `runner.page.ts:299-301`, which already pre-fills the arm fields
> from it. Removing it forces frontend changes this milestone is not permitted to make. M14c folds it
> into `timing_json`. Do not drop it.

- [ ] **Step 2: Write the failing migration test**

```java
package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ProgrammingAxesMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void everyWodLandsOnOneOfTheFourMacros() {
        Integer offVocabulary = jdbc.queryForObject(
                "select count(*) from wod where macro not in ('WARMUP','STRENGTH','GYMNASTIC','WORKOUT')",
                Integer.class);
        assertThat(offVocabulary).isZero();
    }

    @Test
    void wodTypeIsGoneFromBothTables() {
        Integer cols = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where column_name = 'wod_type' and table_name in ('wod','template_piece')
                """, Integer.class);
        assertThat(cols).isZero();
    }

    @Test
    void existingRowsAreMarkedAsLibrary() {
        Integer nonLibrary = jdbc.queryForObject("select count(*) from wod where library = false", Integer.class);
        assertThat(nonLibrary).isZero();
    }

    @Test
    void blocksJsonContentWasNotRewritten() {
        // spec decision 8: the migration changes no block content
        Integer emptied = jdbc.queryForObject(
                "select count(*) from wod where blocks_json is null", Integer.class);
        assertThat(emptied).isZero();
    }

    @Test
    void timingPresetIsConstrained() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                jdbc.update("update wod set timing_preset = 'NONSENSE' where true"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ProgrammingAxesMigrationTest`
Expected: FAIL — `macro` does not exist.

- [ ] **Step 4: Add the migration and the vocabulary classes**

```java
package com.boxhub.programming;

import java.util.Set;

/**
 * The macro axis: what part of a class a piece is. FIXED PLATFORM-WIDE, deliberately not
 * box-configurable — M25 publishes workouts across boxes, and per-box macro lists would make the
 * feed's filters and any cross-box comparison meaningless.
 */
public final class Macros {
    private Macros() {}
    public static final Set<String> ALL = Set.of("WARMUP", "STRENGTH", "GYMNASTIC", "WORKOUT");
}
```

```java
package com.boxhub.programming;

import java.util.Set;

/**
 * The timing axis, as PRESETS over a segment sequence — never types. The preset name survives for
 * filtering, analytics and the board's eyebrow, and never constrains what can be built.
 */
public final class TimingPresets {
    private TimingPresets() {}
    public static final Set<String> ALL = Set.of("FOR_TIME", "AMRAP", "EMOM", "TABATA", "INTERVAL");
}
```

Then update `Wod.java`: replace the `wodType` field and accessors with `macro` (`@Column(nullable = false)`), `timingPreset` (`@Column(name = "timing_preset")`), `timingJson` (`@JdbcTypeCode(SqlTypes.JSON)`, `@Column(name = "timing_json", columnDefinition = "jsonb", nullable = false)`, defaulting to `{"rounds":1,"segments":[]}`), and `library` (`@Column(nullable = false)`). Update `TemplatePiece.java` the same way for `macro` and `timingPreset`.

- [ ] **Step 5: Run the test**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ProgrammingAxesMigrationTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V20__programming_axes.sql \
        backend/src/main/java/com/boxhub/programming backend/src/test/java/com/boxhub/programming
git commit -m "feat(m14a): three programming axes — macro, timing preset, explicit score (V20)"
```

---

## Task 6: `WodJson` gains nested blocks and timing segments, with validation

**Files:**
- Modify: `backend/src/main/java/com/boxhub/programming/WodJson.java`
- Create: `backend/src/main/java/com/boxhub/programming/WodJsonValidator.java`
- Modify: `backend/src/main/java/com/boxhub/programming/WodService.java`
- Test: `backend/src/test/java/com/boxhub/programming/WodJsonValidatorTest.java`

**Interfaces:**
- Consumes: `Wod.getTimingJson()/setTimingJson(String)`.
- Produces: `WodJson.Block` with an added `List<Block> blocks` component. `WodJson.Segment(int seconds, String kind, String label)`. `WodJson.Timing(int rounds, List<Segment> segments)`. `WodJsonValidator.validateBlocks(WodJson.Blocks)` and `validateTiming(WodJson.Timing)`, both throwing the project's existing 400-mapped exception.

- [ ] **Step 1: Write the failing test**

```java
package com.boxhub.programming;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WodJsonValidatorTest {

    private WodJson.Block leaf(String label) {
        return new WodJson.Block(label, null, List.of(new WodJson.Line("10 squats", null, "10", null, null)), null);
    }

    @Test
    void oneLevelIsValid() {                       // existing content must stay valid
        WodJson.Blocks b = new WodJson.Blocks(List.of(leaf("Warmup")));
        WodJsonValidator.validateBlocks(b);        // does not throw
    }

    @Test
    void twoLevelsAreValid() {                     // spec decision 8
        WodJson.Block macro = new WodJson.Block("Strength", null, List.of(), List.of(leaf("A"), leaf("B")));
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(macro)));
    }

    @Test
    void aMacroMayHoldLinesDirectly() {             // no synthetic wrapper for a simple warmup
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(leaf("Warmup"))));
    }

    @Test
    void threeLevelsAreRejected() {                 // the cap is a validator, so it MUST be tested
        WodJson.Block inner = new WodJson.Block("inner", null, List.of(), List.of(leaf("deep")));
        WodJson.Block macro = new WodJson.Block("macro", null, List.of(), List.of(inner));
        assertThatThrownBy(() -> WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(macro))))
                .hasMessageContaining("BLOCK_DEPTH");
    }

    @Test
    void tabataRoundTrips() {                       // the tour's own table, verbatim
        WodJson.Timing t = new WodJson.Timing(8, List.of(
                new WodJson.Segment(20, "WORK", null),
                new WodJson.Segment(10, "REST", null)));
        WodJsonValidator.validateTiming(t);
        assertThat(t.segments()).hasSize(2);
    }

    @Test
    void theCoachesMixedIntervalRoundTrips() {
        WodJson.Timing t = new WodJson.Timing(5, List.of(
                new WodJson.Segment(30, "WORK", "squat"),
                new WodJson.Segment(15, "REST", null),
                new WodJson.Segment(30, "WORK", "burpees")));
        WodJsonValidator.validateTiming(t);
    }

    @Test
    void aSegmentKindMustBeWorkOrRest() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(60, "SLEEP", null)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_KIND");
    }

    @Test
    void segmentSecondsMustBePositive() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(0, "WORK", null)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_SECONDS");
    }
}
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=WodJsonValidatorTest`
Expected: FAIL — `WodJsonValidator` does not exist and `Block` has four components, not three.

- [ ] **Step 3: Extend `WodJson`**

```java
package com.boxhub.programming;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.UUID;

/** Hybrid WOD content: typed top-level fields live on the Wod row; movement lines live here as JSONB. */
public final class WodJson {
    private WodJson() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(String text, UUID movementId, String reps, String load, String scaling) {}

    /**
     * A block holds lines, sub-blocks, or both. Nesting is capped at TWO levels — a block that is
     * itself nested must not carry `blocks`. The cap is enforced by WodJsonValidator, not by the type,
     * so that every blocks_json value written before M14a stays valid unchanged.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Block(String label, String note, List<Line> lines, List<Block> blocks) {}

    public record Blocks(List<Block> blocks) {
        public static Blocks empty() { return new Blocks(List.of()); }
    }

    /** WHEN a piece runs. Independent of Block, which is WHAT it prescribes (spec decision 7). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Segment(int seconds, String kind, String label) {}

    public record Timing(int rounds, List<Segment> segments) {
        public static Timing empty() { return new Timing(1, List.of()); }
    }
}
```

- [ ] **Step 4: Write the validator**

```java
package com.boxhub.programming;

import java.util.List;

/**
 * Blocks nest exactly two levels and segments are well-formed. This is the price of spec decision 8:
 * the depth cap lives here rather than in the type system, so that no blocks_json value had to be
 * rewritten by the migration. An untested validator is not a guarantee — see WodJsonValidatorTest.
 */
public final class WodJsonValidator {
    private WodJsonValidator() {}

    public static void validateBlocks(WodJson.Blocks blocks) {
        if (blocks == null || blocks.blocks() == null) return;
        for (WodJson.Block b : blocks.blocks()) {
            List<WodJson.Block> children = b.blocks();
            if (children == null) continue;
            for (WodJson.Block child : children) {
                if (child.blocks() != null && !child.blocks().isEmpty()) {
                    throw new IllegalArgumentException("BLOCK_DEPTH: blocks nest at most two levels");
                }
            }
        }
    }

    public static void validateTiming(WodJson.Timing timing) {
        if (timing == null) return;
        if (timing.rounds() < 1) {
            throw new IllegalArgumentException("TIMING_ROUNDS: rounds must be at least 1");
        }
        if (timing.segments() == null) return;
        for (WodJson.Segment s : timing.segments()) {
            if (!"WORK".equals(s.kind()) && !"REST".equals(s.kind())) {
                throw new IllegalArgumentException("SEGMENT_KIND: must be WORK or REST");
            }
            if (s.seconds() <= 0) {
                throw new IllegalArgumentException("SEGMENT_SECONDS: must be positive");
            }
        }
    }
}
```

> **Executor note:** `IllegalArgumentException` is a placeholder ONLY if the project already maps it
> to RFC7807 400. **Open the existing error-handling code and use the project's real exception type**
> — the codebase has a `conflict(...)` style helper used in `BookingService`. Match what is there.
> Keep the message prefixes (`BLOCK_DEPTH:`, `SEGMENT_KIND:`, `SEGMENT_SECONDS:`, `TIMING_ROUNDS:`)
> whatever type you use — the tests assert on them.

- [ ] **Step 5: Call the validator from `WodService` on every write**

Wherever `WodService` serializes blocks or timing onto a `Wod`, call `WodJsonValidator.validateBlocks`
and `validateTiming` first. A write path that skips the validator is the failure mode this whole task
exists to prevent.

- [ ] **Step 6: Run the test**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=WodJsonValidatorTest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/programming backend/src/test/java/com/boxhub/programming
git commit -m "feat(m14a): two-level blocks and timing segments, with a tested depth cap"
```

---

## Task 7: Score becomes explicit — `defaultScoreType` deleted

**Files:**
- Modify: `backend/src/main/java/com/boxhub/programming/PieceTypes.java` (delete the method; delete the class if `ALL` has no remaining consumer)
- Modify: `backend/src/main/java/com/boxhub/programming/SessionItemController.java:53`
- Modify: `backend/src/main/java/com/boxhub/programming/SessionItem.java`
- Modify: `backend/src/main/resources/db/migration/V20__programming_axes.sql` (append — it is not yet applied anywhere but a dev machine)
- Test: `backend/src/test/java/com/boxhub/programming/ExplicitScoreTypeTest.java`

**Interfaces:**
- Consumes: Task 5's `wod.macro`.
- Produces: `session_item.score_type` is `NOT NULL`. No derivation exists anywhere.

- [ ] **Step 1: Append the backfill to V20**

```sql
-- score is now EXPLICIT, never derived (spec decision 4). Backfill by applying the OLD derivation
-- rule once, to the value it would have produced, then make the column mandatory.
update session_item si
set score_type = coalesce(si.score_type, case w.timing_preset
        when 'FOR_TIME' then 'TIME'
        when 'AMRAP'    then 'ROUNDS_REPS'
        when 'INTERVAL' then 'ROUNDS_REPS'
        else case w.macro when 'STRENGTH' then 'LOAD' else 'NONE' end
    end)
from wod w
where w.id = si.wod_id;

alter table session_item alter column score_type set not null;
```

> This reproduces `PieceTypes.defaultScoreType` exactly: `FOR_TIME`→`TIME`, `AMRAP`/`INTERVAL`→
> `ROUNDS_REPS`, `STRENGTH`→`LOAD`, everything else→`NONE`. Read the original method before writing
> this and confirm the mapping rather than trusting this comment.

- [ ] **Step 2: Write the failing test**

```java
package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ExplicitScoreTypeTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void noSessionItemHasANullScoreType() {
        Integer nulls = jdbc.queryForObject(
                "select count(*) from session_item where score_type is null", Integer.class);
        assertThat(nulls).isZero();
    }

    @Test
    void theColumnIsMandatory() {
        String nullable = jdbc.queryForObject("""
                select is_nullable from information_schema.columns
                where table_name = 'session_item' and column_name = 'score_type'
                """, String.class);
        assertThat(nullable).isEqualTo("NO");
    }
}
```

- [ ] **Step 3: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ExplicitScoreTypeTest`
Expected: FAIL — the column is still nullable.

- [ ] **Step 4: Delete the derivation and its caller's fallback**

In `SessionItemController.java:53`, replace:

```java
return item.getScoreType() != null ? item.getScoreType() : PieceTypes.defaultScoreType(wod.getWodType());
```

with:

```java
return item.getScoreType();
```

In `SessionItem.java`, make `scoreType` `@Column(name = "score_type", nullable = false)` and delete the
`// null = derive from wod.wod_type` comment. Then delete `PieceTypes.defaultScoreType`. Run
`grep -rn "PieceTypes" backend/src` — if `ALL` has no consumer left, delete the class entirely rather
than leaving a vocabulary nobody reads.

- [ ] **Step 5: Run the test and the full suite**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A backend/src
git commit -m "feat(m14a): score type is explicit, defaultScoreType deleted"
```

---

## Task 8: A class owns its content — copy on attach

**Files:**
- Modify: `backend/src/main/java/com/boxhub/programming/WodService.java`
- Test: `backend/src/test/java/com/boxhub/programming/WodLibraryCopyTest.java`

**Interfaces:**
- Consumes: `Wod.isLibrary()/setLibrary(boolean)`.
- Produces: `WodService.attachToSession(UUID libraryWodId, UUID sessionId, int sortOrder)` returning the new `SessionItem`, having created a non-library copy of the WOD. `WodService.promoteToLibrary(UUID wodId)` setting `library = true` on a copy.

- [ ] **Step 1: Write the failing test**

```java
package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class WodLibraryCopyTest extends AbstractIntegrationTest {

    @Autowired WodService wods;
    @Autowired WodRepository wodRepo;

    @Test
    void attachingALibraryWodCopiesItSoTheClassOwnsItsContent() {   // spec decision 3
        seedBoxAndAuthenticate();
        Wod library = seedLibraryWod("Fran");        // helper: library = true
        var session = seedSession();

        var item = wods.attachToSession(library.getId(), session.getId(), 0);

        assertThat(item.getWodId()).isNotEqualTo(library.getId());
        Wod copy = wodRepo.findById(item.getWodId()).orElseThrow();
        assertThat(copy.isLibrary()).isFalse();
        assertThat(copy.getTitle()).isEqualTo("Fran");
    }

    @Test
    void editingTheLibraryEntryDoesNotChangeAClassThatAlreadyRan() {
        seedBoxAndAuthenticate();
        Wod library = seedLibraryWod("Cindy");
        var session = seedSession();
        var item = wods.attachToSession(library.getId(), session.getId(), 0);

        library.setTitle("Cindy (modified)");
        wodRepo.save(library);

        Wod copy = wodRepo.findById(item.getWodId()).orElseThrow();
        assertThat(copy.getTitle()).isEqualTo("Cindy");
    }

    @Test
    void reSavingAnAttachedPieceUpdatesInPlaceAndDoesNotGrowTheLibrary() {
        // the filed unbounded-growth bug: quick-created pieces became library wods on every re-save
        seedBoxAndAuthenticate();
        var session = seedSession();
        Wod library = seedLibraryWod("Helen");
        var item = wods.attachToSession(library.getId(), session.getId(), 0);

        long libraryCountBefore = wodRepo.findAll().stream().filter(Wod::isLibrary).count();

        Wod copy = wodRepo.findById(item.getWodId()).orElseThrow();
        copy.setTitle("Helen, scaled");
        wodRepo.save(copy);
        copy.setTitle("Helen, scaled again");
        wodRepo.save(copy);

        long libraryCountAfter = wodRepo.findAll().stream().filter(Wod::isLibrary).count();
        assertThat(libraryCountAfter).isEqualTo(libraryCountBefore);
    }
}
```

> **Executor note:** `seedLibraryWod` and `seedSession` are illustrative. Write real helpers in this
> test class, or reuse whatever `AbstractIntegrationTest` already provides. Open it before writing.

- [ ] **Step 2: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=WodLibraryCopyTest`
Expected: FAIL — `attachToSession` does not exist.

- [ ] **Step 3: Implement copy-on-attach in `WodService`**

```java
    /**
     * Attaching a library WOD to a class COPIES it: the class owns its content, so editing the
     * library entry later never rewrites what a class that already ran actually did (spec decision 3).
     * The copy is library = false. This is also the root-cause fix for the unbounded-growth bug —
     * subsequent edits update the copy in place instead of inserting new library rows.
     */
    @Transactional
    public SessionItem attachToSession(UUID libraryWodId, UUID sessionId, int sortOrder) {
        Wod source = wodRepo.findById(libraryWodId).orElseThrow();
        Wod copy = new Wod();
        copy.setTitle(source.getTitle());
        copy.setMacro(source.getMacro());
        copy.setTimingPreset(source.getTimingPreset());
        copy.setTimingJson(source.getTimingJson());
        copy.setScoreType(source.getScoreType());
        copy.setTimeCapSeconds(source.getTimeCapSeconds());
        copy.setBodyText(source.getBodyText());
        copy.setBlocksJson(source.getBlocksJson());
        copy.setScalingNotes(source.getScalingNotes());
        copy.setBenchmarkTemplateId(source.getBenchmarkTemplateId());
        copy.setLibrary(false);
        wodRepo.save(copy);

        SessionItem item = new SessionItem();
        item.setSessionId(sessionId);
        item.setWodId(copy.getId());
        item.setSortOrder(sortOrder);
        item.setScoreType(copy.getScoreType());
        return sessionItems.save(item);
    }
```

> `benchmarkTemplateId` is copied deliberately: a copy of a benchmark is still that benchmark, and
> the leaderboard groups on it. Do not drop it.

- [ ] **Step 4: Run the test**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=WodLibraryCopyTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/programming backend/src/test/java/com/boxhub/programming
git commit -m "feat(m14a): a class owns its programming content — copy on attach"
```

---

## Task 9: V21 — cancellation becomes a fact

**Files:**
- Create: `backend/src/main/resources/db/migration/V21__booking_cancellation.sql`
- Modify: `backend/src/main/java/com/boxhub/box/Booking.java`, `BookingService.java`
- Test: `backend/src/test/java/com/boxhub/box/BookingCancellationTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `bookings.cancelled_at`, `bookings.was_late`. `uq_active_booking` is partial. `Booking.getCancelledAt()/setCancelledAt(Instant)`, `getWasLate()/setWasLate(Boolean)`. `BookingService.cancel` no longer deletes.

- [ ] **Step 1: Write the migration**

```sql
-- M14a: cancel used to call bookings.delete(), so "who cancels a lot" and "late-cancel rate" were
-- not hard but IMPOSSIBLE. The status check already permits CANCELLED (V3) — it was simply never used.

alter table bookings add column cancelled_at timestamptz;
alter table bookings add column was_late     boolean;

-- Without this, a soft cancel would forbid ever re-booking a class you once cancelled.
-- Same partial-index pattern as uq_subscription_active in V14.
alter table bookings drop constraint uq_active_booking;
create unique index uq_active_booking on bookings (session_id, membership_id)
    where status <> 'CANCELLED';

create index idx_bookings_cancelled on bookings (box_id, cancelled_at) where cancelled_at is not null;
```

- [ ] **Step 2: Write the failing test**

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class BookingCancellationTest extends AbstractIntegrationTest {

    @Autowired BookingService bookings;
    @Autowired BookingRepository bookingRepo;

    @Test
    void cancellingKeepsTheRowAndStampsWhen() {
        var ctx = seedBookableSession();
        var booking = bookings.book(ctx.sessionId(), ctx.membershipId());

        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        var row = bookingRepo.findById(booking.getId()).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("CANCELLED");
        assertThat(row.getCancelledAt()).isNotNull();
        assertThat(row.getWasLate()).isNotNull();
    }

    @Test
    void aCancelledBookingDoesNotBlockReBooking() {
        var ctx = seedBookableSession();
        bookings.book(ctx.sessionId(), ctx.membershipId());
        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        var again = bookings.book(ctx.sessionId(), ctx.membershipId());

        assertThat(again.getStatus()).isEqualTo("BOOKED");
        assertThat(bookingRepo.findAll().stream()
                .filter(b -> b.getMembershipId().equals(ctx.membershipId())).count()).isEqualTo(2);
    }

    @Test
    void wasLateIsStampedFromTheCutoffInForceAtCancelTime() {
        // change cancel_cutoff_min AFTER cancelling; the stored verdict must not move
        var ctx = seedBookableSession();
        bookings.book(ctx.sessionId(), ctx.membershipId());
        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        var before = bookingRepo.findAll().stream()
                .filter(b -> b.getCancelledAt() != null).findFirst().orElseThrow().getWasLate();

        setBoxCancelCutoffMinutes(ctx.boxId(), 10_000);   // make everything "late" going forward

        var after = bookingRepo.findAll().stream()
                .filter(b -> b.getCancelledAt() != null).findFirst().orElseThrow().getWasLate();
        assertThat(after).isEqualTo(before);
    }
}
```

> **Executor note:** `seedBookableSession()` and `setBoxCancelCutoffMinutes(...)` are illustrative —
> write them as real helpers in this class. The third test is the one that matters most: it is the
> only guard on spec decision 9's reason for existing.

- [ ] **Step 3: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BookingCancellationTest`
Expected: FAIL — cancel still deletes the row, so `findById` returns empty.

- [ ] **Step 4: Rewrite `BookingService.cancel`**

Replace `bookings.delete(booking)` with a status transition that stamps the verdict at cancel time:

```java
        Instant now = Instant.now();
        boolean late = session.getStartAt()
                .minus(Duration.ofMinutes(box.getCancelCutoffMin()))
                .isBefore(now);

        booking.setStatus("CANCELLED");
        booking.setCancelledAt(now);
        booking.setWasLate(late);
        booking.setPosition(null);
        bookings.save(booking);
```

> `was_late` MUST be computed here and stored. It depends on `box.cancel_cutoff_min`, which is mutable
> and which M15 is putting a UI on — derived at query time, a box loosening its cutoff would
> retroactively forgive every late cancel in its history. Do not move this into a query or a view.
>
> The `PAST_CUTOFF` guard above this block stays exactly as it is. It rejects a late cancel of a
> `BOOKED` booking; `was_late` records lateness for the cancels that ARE permitted. They are different
> things and both are needed.
>
> The waitlist promotion loop below stays as it is. Notifying the promoted athlete is **M17's** job —
> the milestone that decides the notification strategy. Do not add a mail send here.

- [ ] **Step 5: Run the test and the full suite**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V21__booking_cancellation.sql \
        backend/src/main/java/com/boxhub/box backend/src/test/java/com/boxhub/box
git commit -m "feat(m14a): cancellation is a fact, not a deletion (V21)"
```

---

## Task 10: `SlotRegenerationService` — refuse rather than destroy

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/SlotRegenerationService.java`
- Test: `backend/src/test/java/com/boxhub/box/SlotRegenerationTest.java`

**Interfaces:**
- Consumes: `SessionGenerator.generateForSlot(...)`, `BookingRepository`, `ClassSessionRepository`.
- Produces: `SlotRegenerationService.regenerateFrom(UUID slotId, LocalDate from)`. Throws with code `RANGE_HAS_BOOKINGS` carrying the blocking dates when any session at or after `from` holds a live booking.

- [ ] **Step 1: Write the failing test**

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SlotRegenerationTest extends AbstractIntegrationTest {

    @Autowired SlotRegenerationService regeneration;
    @Autowired ClassSessionRepository sessions;

    @Test
    void regeneratesForwardAndLeavesEarlierSessionsAlone() {
        var ctx = seedSlotWithSessions();
        long before = sessions.count();

        regeneration.regenerateFrom(ctx.slotId(), LocalDate.now().plusDays(3));

        assertThat(sessions.count()).isGreaterThanOrEqualTo(before - 1);
        assertThat(sessions.findById(ctx.pastSessionId())).isPresent();
    }

    @Test
    void refusesWhenARangeHoldsALiveBooking() {          // spec decision 11
        var ctx = seedSlotWithSessions();
        bookSomeoneOnto(ctx.futureSessionId());

        assertThatThrownBy(() -> regeneration.regenerateFrom(ctx.slotId(), LocalDate.now()))
                .hasMessageContaining("RANGE_HAS_BOOKINGS");
    }

    @Test
    void refusalIsTotal_nothingInTheRangeIsRegenerated() {
        var ctx = seedSlotWithSessions();
        bookSomeoneOnto(ctx.futureSessionId());
        var idsBefore = sessions.findAll().stream().map(ClassSession::getId).sorted().toList();

        try { regeneration.regenerateFrom(ctx.slotId(), LocalDate.now()); } catch (RuntimeException expected) { }

        var idsAfter = sessions.findAll().stream().map(ClassSession::getId).sorted().toList();
        assertThat(idsAfter).isEqualTo(idsBefore);
    }

    @Test
    void aCancelledBookingDoesNotBlock() {
        // where decisions 9 and 11 meet. If CANCELLED blocked, accumulated cancels would freeze a
        // slot permanently — invisible until a box has been running a month.
        var ctx = seedSlotWithSessions();
        bookSomeoneOnto(ctx.futureSessionId());
        cancelThatBooking(ctx.futureSessionId());

        regeneration.regenerateFrom(ctx.slotId(), LocalDate.now());   // does not throw
    }

    @Test
    void waitlistCheckedInAndNoShowAllBlock() {
        for (String status : new String[]{"WAITLIST", "CHECKED_IN", "NO_SHOW"}) {
            var ctx = seedSlotWithSessions();
            bookSomeoneOntoWithStatus(ctx.futureSessionId(), status);

            assertThatThrownBy(() -> regeneration.regenerateFrom(ctx.slotId(), LocalDate.now()))
                    .as("status %s must block regeneration", status)
                    .hasMessageContaining("RANGE_HAS_BOOKINGS");
        }
    }
}
```

- [ ] **Step 2: Run it and verify it fails**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=SlotRegenerationTest`
Expected: FAIL — `SlotRegenerationService` does not exist.

- [ ] **Step 3: Implement the service**

```java
package com.boxhub.box;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;
import java.util.UUID;

/**
 * Regenerates a slot's sessions from a date forward. It REFUSES a range that holds a live booking
 * rather than cancelling or moving anyone (spec decision 11): both destructive options send mail, and
 * an admin adjusting a schedule must not be able to mail forty people by accident.
 *
 * A CANCELLED booking is history, not a claim on a place, and does NOT block — otherwise accumulated
 * cancels would freeze a slot permanently. BOOKED, WAITLIST and CHECKED_IN are live claims; NO_SHOW is
 * attendance history that regeneration would destroy. All four block.
 */
@Service
public class SlotRegenerationService {

    private static final List<String> BLOCKING = List.of("BOOKED", "WAITLIST", "CHECKED_IN", "NO_SHOW");

    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final BoxRepository boxes;
    private final SessionGenerator generator;

    public SlotRegenerationService(ScheduleSlotRepository slots, ClassTypeRepository types,
                                   ClassSessionRepository sessions, BookingRepository bookings,
                                   BoxRepository boxes, SessionGenerator generator) {
        this.slots = slots; this.types = types; this.sessions = sessions;
        this.bookings = bookings; this.boxes = boxes; this.generator = generator;
    }

    @Transactional
    public void regenerateFrom(UUID slotId, LocalDate from) {
        ScheduleSlot slot = slots.findById(slotId).orElseThrow();
        ClassType type = types.findById(slot.getClassTypeId()).orElseThrow();
        Box box = boxes.findById(slot.getBoxId()).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        Instant fromInstant = from.atStartOfDay(tz).toInstant();

        List<ClassSession> inRange = sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, fromInstant);

        List<String> blockingDates = inRange.stream()
                .filter(s -> bookings.existsBySessionIdAndStatusIn(s.getId(), BLOCKING))
                .map(s -> LocalDate.ofInstant(s.getStartAt(), tz).toString())
                .sorted().distinct().toList();

        if (!blockingDates.isEmpty()) {
            throw new IllegalStateException("RANGE_HAS_BOOKINGS: " + String.join(", ", blockingDates));
        }

        sessions.deleteAll(inRange);
        generator.generateForSlot(slot, type, tz, box.getBookingHorizonWeeks());
    }
}
```

> **Executor note:** `IllegalStateException` is a placeholder. Use the project's real RFC7807-mapped
> conflict exception — `BookingService` has the pattern (`throw conflict("PAST_CUTOFF")`). Keep the
> `RANGE_HAS_BOOKINGS` code and keep the blocking dates in the payload; M14b renders them so the admin
> knows what to clear.
>
> Add `findByScheduleSlotIdAndStartAtGreaterThanEqual` and `existsBySessionIdAndStatusIn` to the
> repositories. Both are derived queries on `@TenantId` entities, which is correct here because this
> operation is deliberately scoped to the caller's box.

- [ ] **Step 4: Run the test**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=SlotRegenerationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/box/SlotRegenerationService.java \
        backend/src/main/java/com/boxhub/box/ClassSessionRepository.java \
        backend/src/main/java/com/boxhub/box/BookingRepository.java \
        backend/src/test/java/com/boxhub/box/SlotRegenerationTest.java
git commit -m "feat(m14a): regenerate a slot forward, refusing ranges that hold bookings"
```

---

## Task 11: Full gates and milestone closure

**Files:**
- Modify: `.superpowers/sdd/progress.md`, `docs/HANDOFF.md`, `docs/BACKLOG.md`

- [ ] **Step 1: Run every gate**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
cd ../frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build
```

Then bring the stack up on a clean volume and run e2e — the frontend reads this model through booking,
the classes page and the runner, and a screen is not verified until e2e runs on it:

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```

Expected: backend green, Karma green, production build clean, e2e at its current baseline of
64 passed + 1 skipped. **The 1 skip is the quarantined TV/SSE defect and stays skipped — Project 2
owns it, do not investigate.**

- [ ] **Step 2: Close the filed backlog item**

`docs/BACKLOG.md`, under `### → M14 Class model & schedule`, remove the entry beginning *"Instance-builder
save creates new `wod` rows on every edited re-save"* — Task 8 fixes it — and note in its place that
the copy-on-attach model landed in M14a. Leave the day-pager, score-type select, coach help and
drag-and-drop entries alone; those are M14b and M14c.

- [ ] **Step 3: Record the milestone**

Append an M14a section to `.superpowers/sdd/progress.md` covering: the twelve decisions and where each
landed, the three migrations, the final gate numbers, anything that turned out differently from the
plan, and any test that could not be made to fail before it passed.

Update `docs/HANDOFF.md`'s status section and its "next Flyway is Vnn" note — it will read **V22**.

- [ ] **Step 4: Commit**

```bash
git add -A docs .superpowers
git commit -m "docs(m14a): close the milestone — gates, ledger, and the backlog item it fixed"
```

---

## Self-Review

**Spec coverage.** Decision 1 (snapshot) → Task 3. Decision 2 (slot owns the numbers) → Tasks 1–2.
Decision 3 (library flag, copy on attach) → Tasks 5 and 8. Decision 4 (explicit score) → Task 7.
Decision 5 (fixed four macros) → Task 5. Decision 6 (timing as jsonb segments) → Tasks 5–6.
Decision 7 (blocks and segments independent) → Task 6. Decision 8 (optional nested blocks, depth cap)
→ Task 6. Decision 9 (cancellation as a fact) → Task 9. Decision 10 (`country` out) → nothing here, by
design; it is M22's. Decision 11 (refuse regeneration) → Task 10. Decision 12 (type with zero slots) →
Task 2, first test. All five of the spec's required tests appear: depth-3 rejection (Task 6),
book/cancel/re-book (Task 9), `was_late` immutability (Task 9), the cancel-versus-regenerate
interaction (Task 10), and the migration mapping with untouched `blocks_json` (Tasks 1 and 5).

**Placeholders.** None. Where a helper is illustrative — `seedBoxAndAuthenticate`,
`seedBookableSession`, `seedSlotWithSessions` — the plan says so explicitly and instructs the executor
to read `AbstractIntegrationTest` rather than invent one. Where an exception type is a placeholder, the
plan names the real pattern to copy and pins the error codes the tests assert on.

**Type consistency.** `getScheduleSlotId` is used identically in Tasks 2, 3 and 10. `generateForSlot`
carries the same four-parameter signature in Tasks 3 and 10. `Macros.ALL` and `TimingPresets.ALL` match
the SQL check constraints in Task 5 exactly, including `TABATA` being present in the preset list and
absent from every migration mapping. `WodJson.Block` gains its fourth component in Task 6 and is
constructed with four arguments everywhere it appears.
