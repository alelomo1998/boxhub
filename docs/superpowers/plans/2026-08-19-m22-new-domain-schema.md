# M22 — New-Domain Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the schema every Phase 2 milestone needs — box public profile, rooms, coach profile and availability, the drop-in, PT, social posts and ratings, payout accounts — before any screen exists to bias it.

**Architecture:** Additive Flyway migrations plus JPA entities and the minimum repositories the tests need. No endpoints, no DTOs, no screens. Tenancy classification is the load-bearing decision in every task: wholly-public tables drop `@TenantId` and carry an explicit `box_id` predicate; mixed-visibility and box-operational tables keep it. Coach tables are keyed on the **user**, not the box.

**Tech Stack:** Spring Boot 3.5 / Java 21, Hibernate 6 `@TenantId` discriminator multitenancy, Flyway, PostgreSQL 16, JUnit 5 + AssertJ + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-19-m22-new-domain-schema-design.md` — read it before Task 1. Every decision below is `D<n>` in its §2.

## Global Constraints

- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21` for every backend command.** The system JDK is 26 and too new.
- **Absolute paths in every gate command.** `cd` does not persist between steps; a relative path silently runs Maven in the wrong directory and reports a failure that is not real.
- **Maven's `-Dtest=` separator is a comma, not a plus.** `-Dtest='A+B'` fails with "No tests matching pattern", which reads exactly like a code failure.
- **Schema changes only via Flyway. Never edit an applied migration.**
- **No endpoints, no DTOs, no screens.** Phase 1 rule. Task 7 is the single, spec-mandated exception and touches only existing export/delete behaviour.
- **`AuthzConformanceTest` must need no edits.** M22 adds no routes. If it goes red, that is a finding to investigate, never a line to adjust — and only the orchestrator may touch that file.
- **Run the negative control on every test.** Break the implementation, watch the named test go red, revert, re-verify green. If you cannot name the mutation a test catches, say so instead of counting it as coverage.
- **Baseline to hold:** backend `Tests run: 494, Failures: 0, Errors: 0` at the branch point. Each task states its own expected new total.

## Deviation from spec §11, recorded rather than silent

Spec §11 says "one migration, `V22__new_domain_schema.sql`". **This plan uses six migrations, `V22`–`V27`, one per schema task.** Reason: six tasks editing one unapplied migration file means every task after the first changes a file whose checksum a local dev stack has already recorded, and a reviewer gating task 4 reads a file tasks 1–3 also wrote. Flyway's normal unit is one migration per coherent change. The spec's §11 ordering constraint still holds *within* each file: columns before the tables that reference them, constraints last.

No migration in this plan is destructive. Every existing row stays valid without backfill.

---

### Task 1: Box public profile, location and the directory indexes

**Owner:** executor (Sonnet).

**Files:**
- Create: `backend/src/main/resources/db/migration/V22__box_public_profile.sql`
- Create: `backend/src/main/java/com/boxhub/box/BoxPhoto.java`
- Create: `backend/src/main/java/com/boxhub/box/BoxPhotoRepository.java`
- Create: `backend/src/main/java/com/boxhub/box/BoxHours.java`
- Create: `backend/src/main/java/com/boxhub/box/BoxHoursRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/Box.java`
- Test: `backend/src/test/java/com/boxhub/box/BoxPublicProfileTest.java`

**Interfaces:**
- Produces: `BoxPhoto`, `BoxHours` entities and their repositories; `Box` getters/setters for `published`, `description`, `street`, `city`, `region`, `postcode`, `country`, `lat`, `lng`. Task 8 documents them.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/box/BoxPublicProfileTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The directory lists MANY boxes at once. Under M21 a @TenantId table cannot serve that:
 * runAsBox scopes to one box and runAsRoot is forbidden on a request thread. So these tables
 * must NOT be @TenantId — spec §3. These tests fail if anyone adds the annotation.
 */
class BoxPublicProfileTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired BoxPhotoRepository photos;
    @Autowired BoxHoursRepository hours;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug, boolean published) {
        Box b = new Box();
        b.setName("Pub " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setPublished(published);
        b.setCity("Milano");
        b.setCountry("IT");
        b.setLat(45.4642);
        b.setLng(9.1900);
        return boxes.save(b);
    }

    @Test
    void photosOfTwoDifferentBoxesAreBothReadableWithNoAmbientTenant() {
        long n = System.nanoTime();
        UUID a = newBox("pp-a-" + n, true).getId();
        UUID b = newBox("pp-b-" + n, true).getId();

        BoxPhoto pa = new BoxPhoto(); pa.setBoxId(a); pa.setPath("/media/pub/a.jpg"); pa.setSortOrder(0);
        BoxPhoto pb = new BoxPhoto(); pb.setBoxId(b); pb.setPath("/media/pub/b.jpg"); pb.setSortOrder(0);
        photos.save(pa); photos.save(pb);

        // No SecurityContext at all: this is the anonymous/boxless directory read.
        assertThat(photos.findByBoxIdInOrderBySortOrder(List.of(a, b)))
                .extracting(BoxPhoto::getPath)
                .containsExactlyInAnyOrder("/media/pub/a.jpg", "/media/pub/b.jpg");
    }

    @Test
    void openingHoursOfTwoDifferentBoxesAreBothReadableWithNoAmbientTenant() {
        long n = System.nanoTime();
        UUID a = newBox("ph-a-" + n, true).getId();
        UUID b = newBox("ph-b-" + n, true).getId();

        // Rows, not columns: a box can have a morning block and an evening block on one weekday.
        hours.save(hours(a, 0, "07:00", "12:00"));
        hours.save(hours(a, 0, "16:00", "22:00"));
        hours.save(hours(b, 0, "09:00", "21:00"));

        assertThat(hours.findByBoxIdIn(List.of(a, b))).hasSize(3);
    }

    private BoxHours hours(UUID boxId, int weekday, String open, String close) {
        BoxHours h = new BoxHours();
        h.setBoxId(boxId);
        h.setWeekday(weekday);
        h.setOpenTime(LocalTime.parse(open));
        h.setCloseTime(LocalTime.parse(close));
        return h;
    }

    @Test
    void unpublishedBoxesAreExcludedFromTheDirectoryProjection() {
        long n = System.nanoTime();
        newBox("pv-on-" + n, true);
        newBox("pv-off-" + n, false);

        assertThat(boxes.findByPublishedTrue())
                .extracting(Box::getSlug)
                .contains("pv-on-" + n)
                .doesNotContain("pv-off-" + n);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BoxPublicProfileTest > /tmp/m22-t1-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|ERROR.*BoxPublicProfileTest|COMPILATION" /tmp/m22-t1-red.txt | head -5
```

Expected: compilation failure — `BoxPhoto`, `BoxHours`, their repositories and the new `Box` setters do not exist.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V22__box_public_profile.sql`:

```sql
-- M22 spec §4. These tables are deliberately NOT @TenantId: the public directory reads them
-- across many boxes at once, and under M21 a @TenantId read cannot do that (runAsBox is one
-- box, runAsRoot is jobs-only). Safe here because the tables are WHOLLY public — there is no
-- private box-profile data to leak through a missed predicate. See docs/TENANCY.md §4.

alter table boxes
    add column published   boolean not null default false,
    add column description text,
    add column street      text,
    add column city        text,
    add column region      text,
    add column postcode    text,
    add column country     text,
    add column lat         double precision,
    add column lng         double precision;

create table box_photo (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    path       text not null,
    sort_order int  not null default 0,
    created_at timestamptz not null default now()
);
create index idx_box_photo_box on box_photo (box_id, sort_order);

-- Rows rather than open/close columns on boxes: a box can have split hours (morning AND
-- evening) on the same weekday, which is normal in Italy.
create table box_hours (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    weekday    int  not null check (weekday between 0 and 6),
    open_time  time not null,
    close_time time not null,
    constraint ck_box_hours_order check (close_time > open_time)
);
create index idx_box_hours_box on box_hours (box_id, weekday);

-- Directory filtering, and the bounding-box prefilter that replaces PostGIS (spec D8).
create index idx_boxes_directory on boxes (published, country, city) where published;
create index idx_boxes_geo on boxes (lat, lng) where published;
```

- [ ] **Step 4: Add the `Box` columns**

In `backend/src/main/java/com/boxhub/box/Box.java`, add these fields after `private String locale = "en";`:

```java
    @Column(nullable = false) private boolean published = false;
    @Column private String description;
    @Column private String street;
    @Column private String city;
    @Column private String region;
    @Column private String postcode;
    @Column private String country;
    @Column private Double lat;
    @Column private Double lng;
```

and these accessors at the end of the class, matching the file's existing one-line style:

```java
    public boolean isPublished() { return published; }
    public void setPublished(boolean published) { this.published = published; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getRegion() { return region; }
    public void setRegion(String region) { this.region = region; }
    public String getPostcode() { return postcode; }
    public void setPostcode(String postcode) { this.postcode = postcode; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
```

- [ ] **Step 5: Create the entities and repositories**

`backend/src/main/java/com/boxhub/box/BoxPhoto.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * NOT @TenantId, deliberately. The public directory reads photos for many boxes at once and for
 * boxes the reader does not belong to; a @TenantId read cannot serve that under M21. box_id is
 * carried as a plain column and every query states its own predicate — docs/TENANCY.md §4.
 */
@Entity
@Table(name = "box_photo")
public class BoxPhoto {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id", nullable = false) private UUID boxId;
    @Column(nullable = false) private String path;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/box/BoxPhotoRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface BoxPhotoRepository extends JpaRepository<BoxPhoto, UUID> {
    List<BoxPhoto> findByBoxIdOrderBySortOrder(UUID boxId);
    List<BoxPhoto> findByBoxIdInOrderBySortOrder(Collection<UUID> boxIds);
}
```

`backend/src/main/java/com/boxhub/box/BoxHours.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import java.time.LocalTime;
import java.util.UUID;

/** NOT @TenantId — same reason as BoxPhoto. See docs/TENANCY.md §4. */
@Entity
@Table(name = "box_hours")
public class BoxHours {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id", nullable = false) private UUID boxId;
    @Column(nullable = false) private int weekday;
    @Column(name = "open_time", nullable = false) private LocalTime openTime;
    @Column(name = "close_time", nullable = false) private LocalTime closeTime;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public int getWeekday() { return weekday; }
    public void setWeekday(int weekday) { this.weekday = weekday; }
    public LocalTime getOpenTime() { return openTime; }
    public void setOpenTime(LocalTime openTime) { this.openTime = openTime; }
    public LocalTime getCloseTime() { return closeTime; }
    public void setCloseTime(LocalTime closeTime) { this.closeTime = closeTime; }
}
```

`backend/src/main/java/com/boxhub/box/BoxHoursRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface BoxHoursRepository extends JpaRepository<BoxHours, UUID> {
    List<BoxHours> findByBoxIdOrderByWeekdayAscOpenTimeAsc(UUID boxId);
    List<BoxHours> findByBoxIdIn(Collection<UUID> boxIds);
}
```

- [ ] **Step 6: Add the `Box` directory finder**

In `backend/src/main/java/com/boxhub/box/BoxRepository.java`, add:

```java
    java.util.List<Box> findByPublishedTrue();
```

- [ ] **Step 7: Green**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BoxPublicProfileTest > /tmp/m22-t1-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m22-t1-green.txt | tail -2
```

Expected: `Tests run: 3, Failures: 0, Errors: 0`.

- [ ] **Step 8: Full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t1-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Failures: [0-9]+, Errors: [0-9]+, Skipped: [0-9]+$" /tmp/m22-t1-suite.txt | tail -1
```

Expected: **497** tests (494 + 3), 0 failures, 0 errors.

- [ ] **Step 9: Negative control — MEASURED, not argued**

Add `@org.hibernate.annotations.TenantId` to `BoxPhoto.boxId`. Rerun `BoxPublicProfileTest`.
Expected: `photosOfTwoDifferentBoxesAreBothReadableWithNoAmbientTenant` goes **RED** — with no ambient tenant the read now resolves `NO_TENANT` and returns zero rows. Paste the failure line. Revert and re-verify green.

- [ ] **Step 10: Commit**

```bash
git add -A backend/src && git commit -m "feat(box): public profile, location and opening hours, readable across boxes"
```

---

### Task 2: Rooms

**Owner:** executor (Sonnet).

**Files:**
- Create: `backend/src/main/resources/db/migration/V23__rooms.sql`
- Create: `backend/src/main/java/com/boxhub/box/Room.java`
- Create: `backend/src/main/java/com/boxhub/box/RoomRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/ScheduleSlot.java`
- Modify: `backend/src/main/java/com/boxhub/box/ClassSession.java`
- Test: `backend/src/test/java/com/boxhub/box/RoomTenancyTest.java`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Room` entity (`@TenantId`), `RoomRepository`, and `getRoomId()`/`setRoomId(UUID)` on `ScheduleSlot` and `ClassSession`. Task 4 puts `room_id` on `pt_booking` and needs `room` to exist first.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/box/RoomTenancyTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Rooms are box-operational: the directory never reads them across boxes, so unlike box_photo
 * they ARE @TenantId. This test pins that — it fails if the annotation is dropped.
 */
class RoomTenancyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired RoomRepository rooms;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Room " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void roomsAreIsolatedPerBox() {
        long n = System.nanoTime();
        UUID a = newBoxId("rm-a-" + n);
        UUID b = newBoxId("rm-b-" + n);

        actAsBox(a);
        Room r = new Room();
        r.setName("Floor 1 " + n);
        rooms.save(r); // box_id auto-populated by the tenant resolver

        assertThat(rooms.findAll()).extracting(Room::getName).contains("Floor 1 " + n);

        actAsBox(b); // same call, different tenant: must see nothing of box A
        assertThat(rooms.findAll()).extracting(Room::getName).doesNotContain("Floor 1 " + n);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=RoomTenancyTest > /tmp/m22-t2-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|COMPILATION|ERROR" /tmp/m22-t2-red.txt | head -5
```

Expected: compilation failure — `Room` and `RoomRepository` do not exist.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V23__rooms.sql`:

```sql
-- M22 spec §5 / D11. The "where" axis, which did not exist: class_type (what) ->
-- schedule_slot (when) -> class_sessions (the instance) had no room at all.
--
-- room_id is added to class_sessions NOW rather than in Phase 4 because bookings has an FK to
-- class_sessions: adding it later is a migration against live booking data.
--
-- Deliberately NO room.capacity — class capacity stays authoritative and two capacities with
-- nothing deciding which wins is a question every later surface would answer differently.

create table room (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    name       text not null,
    active     boolean not null default true,
    created_at timestamptz not null default now()
);
create index idx_room_box on room (box_id);

-- Nullable: rooms are OPTIONAL. A single-space box never sets one and nothing changes for it.
alter table schedule_slot  add column room_id uuid references room (id);
alter table class_sessions add column room_id uuid references room (id);
```

- [ ] **Step 4: Create the entity and repository**

`backend/src/main/java/com/boxhub/box/Room.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * @TenantId, unlike box_photo/box_hours: rooms are box-operational and the public directory
 * never reads them across boxes. See docs/TENANCY.md and M22 spec §3.
 */
@Entity
@Table(name = "room")
public class Room {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String name;
    @Column(nullable = false) private boolean active = true;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/box/RoomRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RoomRepository extends JpaRepository<Room, UUID> {
    List<Room> findByActiveTrue();
}
```

- [ ] **Step 5: Add `roomId` to `ScheduleSlot` and `ClassSession`**

In **both** `backend/src/main/java/com/boxhub/box/ScheduleSlot.java` and `backend/src/main/java/com/boxhub/box/ClassSession.java`, add the field:

```java
    @Column(name = "room_id") private UUID roomId;
```

and the accessors:

```java
    public UUID getRoomId() { return roomId; }
    public void setRoomId(UUID roomId) { this.roomId = roomId; }
```

- [ ] **Step 6: Green, then the full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=RoomTenancyTest > /tmp/m22-t2-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m22-t2-green.txt | tail -1
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t2-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-t2-suite.txt | tail -1
```

Expected: 1 test green; full suite **498**, 0 failures, 0 errors.

- [ ] **Step 7: Negative control**

Remove `@TenantId` from `Room.boxId`. Rerun `RoomTenancyTest`. Expected: `roomsAreIsolatedPerBox` goes **RED** at the final assertion — box B now sees box A's room. Paste the line. Revert, re-verify green.

- [ ] **Step 8: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(schedule): rooms, and the room_id axis on slots and sessions"
```

---

### Task 3: Coach profile, availability, time off and payout account

**Owner:** executor (Sonnet).

**Files:**
- Create: `backend/src/main/resources/db/migration/V24__coach_profile.sql`
- Create: `backend/src/main/java/com/boxhub/identity/CoachProfile.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachProfileRepository.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachAvailability.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachAvailabilityRepository.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachTimeOff.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachTimeOffRepository.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachStripe.java`
- Create: `backend/src/main/java/com/boxhub/identity/CoachStripeRepository.java`
- Test: `backend/src/test/java/com/boxhub/identity/CoachProfileTenancyTest.java`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `CoachProfile` (PK `userId`, field `payee` with values `COACH`/`BOX`), `CoachAvailability`, `CoachTimeOff`, `CoachStripe`, and their repositories. Task 4's `pt_booking` and Task 7's export/delete both read these.

**Why these live in `identity`, not `box`:** they are keyed on the **user**, not the box. A coach holds one profile, one calendar and one Stripe account across every box they work at (spec D14).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/CoachProfileTenancyTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spec D14: a coach is assumed to work at ONE box for now, but the schema is cut multi-box-ready
 * so enabling it later needs no migration. That readiness is exactly "these tables are keyed on
 * the user and are NOT tenant-scoped" — if anyone adds @TenantId, a coach's profile and calendar
 * would vanish when they switch box, which is docs/TENANCY.md failure mode 1.
 */
class CoachProfileTenancyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired CoachProfileRepository profiles;
    @Autowired CoachAvailabilityRepository availability;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Coach " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private UUID newUserId(String email) {
        User u = new User();
        u.setEmail(email);
        u.setName("Coach Person");
        u.setPasswordHash("x");
        return users.save(u).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "COACH")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void aCoachProfileAndCalendarReadIdenticallyFromEitherBox() {
        long n = System.nanoTime();
        UUID a = newBoxId("cp-a-" + n);
        UUID b = newBoxId("cp-b-" + n);
        UUID coach = newUserId("cp-" + n + "@t.io");

        actAsBox(a);
        CoachProfile p = new CoachProfile();
        p.setUserId(coach);
        p.setBio("Ten years of barbell " + n);
        p.setPriceCents(5000);
        p.setCurrency("EUR");
        profiles.save(p);

        CoachAvailability slot = new CoachAvailability();
        slot.setUserId(coach);
        slot.setWeekday(1);
        slot.setStartTime(LocalTime.parse("09:00"));
        slot.setEndTime(LocalTime.parse("12:00"));
        availability.save(slot);

        // The same person, read from the OTHER box. One profile, one calendar.
        actAsBox(b);
        assertThat(profiles.findById(coach)).isPresent()
                .get().extracting(CoachProfile::getBio).isEqualTo("Ten years of barbell " + n);
        assertThat(availability.findByUserIdOrderByWeekdayAscStartTimeAsc(coach)).hasSize(1);
    }

    @Test
    void payeeDefaultsToCoach() {
        long n = System.nanoTime();
        UUID coach = newUserId("payee-" + n + "@t.io");

        CoachProfile p = new CoachProfile();
        p.setUserId(coach);
        profiles.saveAndFlush(p);

        // Spec D2: per-coach choice, coach-direct is the default.
        assertThat(profiles.findById(coach)).get()
                .extracting(CoachProfile::getPayee).isEqualTo("COACH");
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=CoachProfileTenancyTest > /tmp/m22-t3-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|COMPILATION|ERROR" /tmp/m22-t3-red.txt | head -5
```

Expected: compilation failure — none of the coach types exist.

**If `User` has no `setName`/`setPasswordHash` with those exact names, STOP and report the real
signatures to the orchestrator rather than inventing a fixture.**

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V24__coach_profile.sql`:

```sql
-- M22 spec §6. Keyed on the USER, never on the box: a coach holds ONE profile, ONE calendar and
-- ONE Stripe account across every box they work at (spec D14). Tenant-scoping any of these would
-- duplicate credentials per box, or make them vanish when the coach switches box — which is
-- docs/TENANCY.md failure mode 1.
--
-- No constraint enforces single-box coaching. Enforcing it would be a partial unique index on
-- memberships where role = 'COACH', which could fail against existing rows and would have to be
-- dropped the moment multi-box is wanted — a one-way migration spent on a temporary assumption.

create table coach_profile (
    user_id     uuid primary key references users (id) on delete cascade,
    bio         text,
    strengths   text,
    weaknesses  text,
    photo_path  text,
    published   boolean not null default false,
    price_cents int,
    currency    text,
    -- Spec D2: the PT payee is a per-coach choice and coach-direct is the default.
    payee       text not null default 'COACH' check (payee in ('COACH', 'BOX')),
    created_at  timestamptz not null default now()
);

create table coach_availability (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    weekday    int  not null check (weekday between 0 and 6),
    start_time time not null,
    end_time   time not null,
    constraint ck_coach_avail_order check (end_time > start_time)
);
create index idx_coach_avail_user on coach_availability (user_id, weekday);

-- Exceptions kept a separate table rather than nullable columns muddying the recurring pattern.
create table coach_time_off (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null references users (id) on delete cascade,
    starts_at timestamptz not null,
    ends_at   timestamptz not null,
    constraint ck_coach_timeoff_order check (ends_at > starts_at)
);
create index idx_coach_timeoff_user on coach_time_off (user_id, starts_at);

-- Mirrors box_stripe exactly: BYO restricted key, not Connect (spec §10).
create table coach_stripe (
    user_id            uuid primary key references users (id) on delete cascade,
    restricted_key_enc text not null,
    webhook_secret_enc text not null,
    enabled            boolean not null default true,
    created_at         timestamptz not null default now()
);
```

- [ ] **Step 4: Create the four entities**

`backend/src/main/java/com/boxhub/identity/CoachProfile.java`:

```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Keyed on the user, NOT @TenantId — one profile per person across every box they coach at
 * (M22 spec D14). The coach owns and publishes this row, which is also what makes
 * DELETE /api/me a single-row removal instead of a cross-entity cascade (spec D7).
 */
@Entity
@Table(name = "coach_profile")
public class CoachProfile {
    @Id @Column(name = "user_id") private UUID userId;
    @Column private String bio;
    @Column private String strengths;
    @Column private String weaknesses;
    @Column(name = "photo_path") private String photoPath;
    @Column(nullable = false) private boolean published = false;
    @Column(name = "price_cents") private Integer priceCents;
    @Column private String currency;
    @Column(nullable = false, insertable = false) private String payee;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getStrengths() { return strengths; }
    public void setStrengths(String strengths) { this.strengths = strengths; }
    public String getWeaknesses() { return weaknesses; }
    public void setWeaknesses(String weaknesses) { this.weaknesses = weaknesses; }
    public String getPhotoPath() { return photoPath; }
    public void setPhotoPath(String photoPath) { this.photoPath = photoPath; }
    public boolean isPublished() { return published; }
    public void setPublished(boolean published) { this.published = published; }
    public Integer getPriceCents() { return priceCents; }
    public void setPriceCents(Integer priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getPayee() { return payee; }
    public void setPayee(String payee) { this.payee = payee; }
    public Instant getCreatedAt() { return createdAt; }
}
```

> `payee` is `insertable = false` so the database default (`'COACH'`) applies on insert and the
> `payeeDefaultsToCoach` test is testing the schema rather than a Java field initialiser. The
> test uses `saveAndFlush` then re-reads for the same reason.

`backend/src/main/java/com/boxhub/identity/CoachAvailability.java`:

```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.LocalTime;
import java.util.UUID;

/** Keyed on the user, NOT @TenantId — one calendar per person. M22 spec D14. */
@Entity
@Table(name = "coach_availability")
public class CoachAvailability {
    @Id @GeneratedValue private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(nullable = false) private int weekday;
    @Column(name = "start_time", nullable = false) private LocalTime startTime;
    @Column(name = "end_time", nullable = false) private LocalTime endTime;

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public int getWeekday() { return weekday; }
    public void setWeekday(int weekday) { this.weekday = weekday; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
}
```

`backend/src/main/java/com/boxhub/identity/CoachTimeOff.java`:

```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Keyed on the user, NOT @TenantId. Exceptions to the recurring availability pattern. */
@Entity
@Table(name = "coach_time_off")
public class CoachTimeOff {
    @Id @GeneratedValue private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
}
```

`backend/src/main/java/com/boxhub/identity/CoachStripe.java`:

```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Keyed on the user, NOT @TenantId: one Stripe account per person across every box. Mirrors
 * box_stripe — BYO restricted key, not Connect. The encrypted key is NEVER exported;
 * GET /api/me/export reports existence only (M22 spec §9).
 */
@Entity
@Table(name = "coach_stripe")
public class CoachStripe {
    @Id @Column(name = "user_id") private UUID userId;
    @Column(name = "restricted_key_enc", nullable = false) private String restrictedKeyEnc;
    @Column(name = "webhook_secret_enc", nullable = false) private String webhookSecretEnc;
    @Column(nullable = false) private boolean enabled = true;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getRestrictedKeyEnc() { return restrictedKeyEnc; }
    public void setRestrictedKeyEnc(String restrictedKeyEnc) { this.restrictedKeyEnc = restrictedKeyEnc; }
    public String getWebhookSecretEnc() { return webhookSecretEnc; }
    public void setWebhookSecretEnc(String webhookSecretEnc) { this.webhookSecretEnc = webhookSecretEnc; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Instant getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 5: Create the four repositories**

```java
// CoachProfileRepository.java
package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface CoachProfileRepository extends JpaRepository<CoachProfile, UUID> {
    List<CoachProfile> findByPublishedTrue();
}
```

```java
// CoachAvailabilityRepository.java
package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface CoachAvailabilityRepository extends JpaRepository<CoachAvailability, UUID> {
    List<CoachAvailability> findByUserIdOrderByWeekdayAscStartTimeAsc(UUID userId);
    void deleteByUserId(UUID userId);
}
```

```java
// CoachTimeOffRepository.java
package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface CoachTimeOffRepository extends JpaRepository<CoachTimeOff, UUID> {
    List<CoachTimeOff> findByUserIdOrderByStartsAt(UUID userId);
    void deleteByUserId(UUID userId);
}
```

```java
// CoachStripeRepository.java
package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface CoachStripeRepository extends JpaRepository<CoachStripe, UUID> { }
```

- [ ] **Step 6: Green, then the full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=CoachProfileTenancyTest > /tmp/m22-t3-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m22-t3-green.txt | tail -1
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t3-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-t3-suite.txt | tail -1
```

Expected: 2 green; full suite **500**, 0 failures, 0 errors.

- [ ] **Step 7: Negative control**

Temporarily annotate `CoachProfile.userId` with `@org.hibernate.annotations.TenantId`. Hibernate then
filters `coach_profile` by the ambient `box_id`, which never equals a user id, so the row becomes
unreadable from either box.

Expected: `aCoachProfileAndCalendarReadIdenticallyFromEitherBox` goes **RED** on the `isPresent()`
assertion. That is exactly the failure mode D14 guards against — tenant-scoping a per-person table
makes the coach's profile vanish, which is `docs/TENANCY.md` failure mode 1. Paste the failure line.
Revert and re-verify green.

- [ ] **Step 8: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(coach): profile, availability, time off and payout account, keyed on the user"
```

---

### Task 4: PT booking

**Owner:** executor (Sonnet).

**Files:**
- Create: `backend/src/main/resources/db/migration/V25__pt_booking.sql`
- Create: `backend/src/main/java/com/boxhub/box/PtBooking.java`
- Create: `backend/src/main/java/com/boxhub/box/PtBookingRepository.java`
- Test: `backend/src/test/java/com/boxhub/box/PtBookingTenancyTest.java`

**Interfaces:**
- Consumes: `room` table from Task 2 (FK target), `memberships` and `users` (existing).
- Produces: `PtBooking` entity (`@TenantId` on `boxId`) and `PtBookingRepository`. Task 5's `payment.pt_booking_id` FK targets this table, so Task 4 must land first.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/box/PtBookingTenancyTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * pt_booking is box-operational, so it IS @TenantId. Note what this means and is recorded in the
 * spec: computing a coach's real free slots once they work at TWO boxes needs a cross-box read,
 * which is deferred to M26 by D14 and needs a registered native query, never runAsRoot.
 */
class PtBookingTenancyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired PtBookingRepository ptBookings;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("PT " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private User newUser(String email) {
        User u = new User();
        u.setEmail(email);
        u.setName("PT Person");
        u.setPasswordHash("x");
        return users.save(u);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void ptBookingsAreIsolatedPerBox() {
        long n = System.nanoTime();
        Box a = newBox("pt-a-" + n);
        Box b = newBox("pt-b-" + n);
        User coach = newUser("ptc-" + n + "@t.io");
        User athlete = newUser("pta-" + n + "@t.io");

        actAsBox(a.getId());
        Membership m = new Membership();
        m.setUser(coach);
        m.setBox(a);
        m.setRole("COACH");
        UUID coachMembership = memberships.save(m).getId();

        PtBooking pt = new PtBooking();
        pt.setCoachMembershipId(coachMembership);
        pt.setAthleteUserId(athlete.getId());
        pt.setStartsAt(Instant.now().plusSeconds(86400));
        pt.setDurationMin(60);
        pt.setStatus("REQUESTED");
        pt.setPriceCents(5000);
        pt.setCurrency("EUR");
        ptBookings.save(pt);

        assertThat(ptBookings.findAll()).hasSize(1);

        actAsBox(b.getId()); // the other box must not see it
        assertThat(ptBookings.findAll()).isEmpty();
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=PtBookingTenancyTest > /tmp/m22-t4-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|COMPILATION|ERROR" /tmp/m22-t4-red.txt | head -5
```

Expected: compilation failure — `PtBooking` does not exist.

**If `Membership` has no `setUser`/`setBox`/`setRole` with those exact signatures, STOP and report
the real ones rather than inventing a fixture.**

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V25__pt_booking.sql`:

```sql
-- M22 spec §6 / D5. A PT session does NOT consume class capacity — it takes no seat in a class
-- and never enters bookings.countBySessionIdAndStatus. But it IS something happening on the
-- floor at a time, so it carries room_id and the admin calendar can show it.
--
-- The data can therefore express a class and a PT session in the same room at the same moment.
-- Detecting that collision is deliberately NOT built here: it is behaviour and M14b owns the
-- calendar. M22's job is to make it representable, which it would not be without room_id.
--
-- coach is a MEMBERSHIP (proves they belong to this box, and matches payment.payee_membership_id);
-- athlete is a USER, because a non-member can book PT.

create table pt_booking (
    id                  uuid primary key default gen_random_uuid(),
    box_id              uuid not null references boxes (id),
    coach_membership_id uuid not null references memberships (id),
    athlete_user_id     uuid not null references users (id),
    room_id             uuid references room (id),
    starts_at           timestamptz not null,
    duration_min        int  not null check (duration_min > 0),
    status              text not null check (status in
                            ('REQUESTED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    price_cents         int  not null,
    currency            text not null,
    created_at          timestamptz not null default now()
);
create index idx_pt_booking_box_start on pt_booking (box_id, starts_at);
create index idx_pt_booking_coach     on pt_booking (coach_membership_id, starts_at);
create index idx_pt_booking_athlete   on pt_booking (athlete_user_id, starts_at);
```

- [ ] **Step 4: Create the entity and repository**

`backend/src/main/java/com/boxhub/box/PtBooking.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId: box-operational. M22 spec §6. */
@Entity
@Table(name = "pt_booking")
public class PtBooking {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "coach_membership_id", nullable = false) private UUID coachMembershipId;
    @Column(name = "athlete_user_id", nullable = false) private UUID athleteUserId;
    @Column(name = "room_id") private UUID roomId;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "duration_min", nullable = false) private int durationMin;
    @Column(nullable = false) private String status;
    @Column(name = "price_cents", nullable = false) private int priceCents;
    @Column(nullable = false) private String currency;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getCoachMembershipId() { return coachMembershipId; }
    public void setCoachMembershipId(UUID coachMembershipId) { this.coachMembershipId = coachMembershipId; }
    public UUID getAthleteUserId() { return athleteUserId; }
    public void setAthleteUserId(UUID athleteUserId) { this.athleteUserId = athleteUserId; }
    public UUID getRoomId() { return roomId; }
    public void setRoomId(UUID roomId) { this.roomId = roomId; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public int getDurationMin() { return durationMin; }
    public void setDurationMin(int durationMin) { this.durationMin = durationMin; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getPriceCents() { return priceCents; }
    public void setPriceCents(int priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/box/PtBookingRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PtBookingRepository extends JpaRepository<PtBooking, UUID> {
    List<PtBooking> findByCoachMembershipIdOrderByStartsAt(UUID coachMembershipId);
    List<PtBooking> findByAthleteUserIdOrderByStartsAt(UUID athleteUserId);
}
```

- [ ] **Step 5: Green, then the full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=PtBookingTenancyTest > /tmp/m22-t4-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m22-t4-green.txt | tail -1
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t4-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-t4-suite.txt | tail -1
```

Expected: 1 green; full suite **501**, 0 failures, 0 errors.

- [ ] **Step 6: Negative control**

Remove `@TenantId` from `PtBooking.boxId`. Rerun. Expected: `ptBookingsAreIsolatedPerBox` goes **RED** on the final `isEmpty()` — box B sees box A's PT booking. Paste the line. Revert, re-verify green.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(coach): PT bookings, located in a room but consuming no class capacity"
```

---

### Task 5: The drop-in on `bookings`, and the payment spine

**Owner:** ORCHESTRATOR. This task changes booking capacity and the money table — the two places
where a wrong diff is expensive. `CLAUDE.md` reserves exactly this for the orchestrator.

**Files:**
- Create: `backend/src/main/resources/db/migration/V26__dropin_and_payment.sql`
- Modify: `backend/src/main/java/com/boxhub/box/Booking.java`
- Modify: `backend/src/main/java/com/boxhub/box/Payment.java`
- Test: `backend/src/test/java/com/boxhub/box/DropInBookingTest.java`
- Test: `backend/src/test/java/com/boxhub/box/PaymentSubjectTest.java`

**Interfaces:**
- Consumes: `pt_booking` from Task 4 (FK target).
- Produces: `Booking.visitorUserId`, `Payment.bookingId`, `Payment.ptBookingId`, `Payment.payeeMembershipId`.

**The argument this task exists to protect:** capacity is enforced by a single count —
`bookings.countBySessionIdAndStatus(sessionId, "BOOKED")` at `BookingService.java:58`. A separate
`dropin_booking` table would make that count silently stop seeing visitors, and **a class could be
oversold**. Drop-ins are therefore rows in `bookings`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/boxhub/box/DropInBookingTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A drop-in is a row in bookings, not its own table. Capacity is one count on bookings
 * (BookingService.java:58) — a separate table would make that count stop seeing visitors and a
 * class could be OVERSOLD. These tests pin that, and pin D13 (a paying visitor never waitlists).
 */
class DropInBookingTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("DI " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private User newUser(String email) {
        User u = new User();
        u.setEmail(email);
        u.setName("DI Person");
        u.setPasswordHash("x");
        return users.save(u);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newSession(UUID boxId) {
        ClassSession s = new ClassSession();
        s.setName("Open gym");
        s.setStartAt(Instant.now().plusSeconds(86400));
        s.setDurationMin(60);
        s.setCapacity(10);
        s.setStatus("SCHEDULED");
        return sessions.save(s).getId();
    }

    @Test
    void aVisitorBookingAndAMemberBookingCountTowardTheSameCapacity() {
        long n = System.nanoTime();
        Box a = newBox("di-a-" + n);
        actAsBox(a.getId());
        UUID sessionId = newSession(a.getId());

        User member = newUser("dim-" + n + "@t.io");
        Membership m = new Membership();
        m.setUser(member); m.setBox(a); m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        User visitor = newUser("div-" + n + "@t.io");

        Booking memberBooking = new Booking();
        memberBooking.setSessionId(sessionId);
        memberBooking.setMembershipId(membershipId);
        memberBooking.setStatus("BOOKED");
        bookings.save(memberBooking);

        Booking visitorBooking = new Booking();
        visitorBooking.setSessionId(sessionId);
        visitorBooking.setVisitorUserId(visitor.getId());
        visitorBooking.setStatus("BOOKED");
        bookings.save(visitorBooking);

        // THE POINT: one count, both rows. This is why a drop-in is not its own table.
        assertThat(bookings.countBySessionIdAndStatus(sessionId, "BOOKED")).isEqualTo(2);
    }

    @Test
    void aBookingMustHaveExactlyOneSubject() {
        long n = System.nanoTime();
        Box a = newBox("di-x-" + n);
        actAsBox(a.getId());
        UUID sessionId = newSession(a.getId());
        User visitor = newUser("dix-" + n + "@t.io");

        Booking neither = new Booking();
        neither.setSessionId(sessionId);
        neither.setStatus("BOOKED");
        assertThatThrownBy(() -> bookings.saveAndFlush(neither))
                .hasMessageContaining("ck_booking_subject");

        Membership m = new Membership();
        User member = newUser("diy-" + n + "@t.io");
        m.setUser(member); m.setBox(a); m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        Booking both = new Booking();
        both.setSessionId(sessionId);
        both.setMembershipId(membershipId);
        both.setVisitorUserId(visitor.getId());
        both.setStatus("BOOKED");
        assertThatThrownBy(() -> bookings.saveAndFlush(both))
                .hasMessageContaining("ck_booking_subject");
    }

    @Test
    void aPayingVisitorCanNotBeWaitlisted() {
        long n = System.nanoTime();
        Box a = newBox("di-w-" + n);
        actAsBox(a.getId());
        UUID sessionId = newSession(a.getId());
        User visitor = newUser("diw-" + n + "@t.io");

        Booking wl = new Booking();
        wl.setSessionId(sessionId);
        wl.setVisitorUserId(visitor.getId());
        wl.setStatus("WAITLIST");
        wl.setPosition(1);

        // Spec D13, enforced by the database rather than by remembering.
        assertThatThrownBy(() -> bookings.saveAndFlush(wl))
                .hasMessageContaining("ck_visitor_not_waitlist");
    }
}
```

Create `backend/src/test/java/com/boxhub/box/PaymentSubjectTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Spec D10: payment carries exactly one of three product FKs, enforced by the database. A
 * polymorphic (type, id) pair could not be policed this way, which is why it was rejected.
 */
class PaymentSubjectTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired PaymentRepository payments;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Pay " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void aPaymentWithNoProductIsRejected() {
        long n = System.nanoTime();
        actAsBox(newBoxId("pay-none-" + n));

        Payment p = new Payment();
        p.setAmountCents(1500);
        p.setCurrency("EUR");
        p.setMethod("CASH");
        p.setStatus("SUCCEEDED");

        assertThatThrownBy(() -> payments.saveAndFlush(p))
                .hasMessageContaining("ck_payment_subject");
    }
}
```

- [ ] **Step 2: Run both and watch them fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=DropInBookingTest,PaymentSubjectTest > /tmp/m22-t5-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|COMPILATION|ERROR" /tmp/m22-t5-red.txt | head -5
```

Note the **comma** separator. Expected: compilation failure — `setVisitorUserId` does not exist.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V26__dropin_and_payment.sql`:

```sql
-- M22 spec §7. A drop-in is a row in bookings, NOT its own table: capacity is enforced by one
-- count (BookingService.java:58) and a separate table would silently stop counting visitors,
-- letting a class be oversold. Every roster read, check-in, TV board and the waitlist promotion
-- would each need a UNION, and missing one reintroduces the bug.

alter table bookings alter column membership_id drop not null;
alter table bookings add column visitor_user_id uuid references users (id);

-- Exactly one subject. Same disjoint-FK pattern as payment below.
alter table bookings add constraint ck_booking_subject
    check ((membership_id is null) <> (visitor_user_id is null));

-- Spec D13: a paying visitor never joins the waitlist, so it is never owed money back.
alter table bookings add constraint ck_visitor_not_waitlist
    check (visitor_user_id is null or status <> 'WAITLIST');

-- Mirrors the existing uq_active_booking exactly (V21 made it partial). NULL membership_id rows
-- do not collide in that index — multiple NULLs are permitted — so visitors need their own.
create unique index uq_active_visitor_booking on bookings (session_id, visitor_user_id)
    where status <> 'CANCELLED';

-- Spec D10. subscription_id was NOT NULL: every payment had to belong to a subscription, and a
-- drop-in and a PT session are neither. Existing rows stay valid untouched — subscription_id set,
-- the other two null.
alter table payment alter column subscription_id drop not null;
alter table payment add column booking_id          uuid references bookings (id);
alter table payment add column pt_booking_id       uuid references pt_booking (id);
-- NULL means the BOX is paid; set means that coach is paid (spec D2, one column).
alter table payment add column payee_membership_id uuid references memberships (id);

alter table payment add constraint ck_payment_subject check (
    (case when subscription_id is not null then 1 else 0 end
   + case when booking_id      is not null then 1 else 0 end
   + case when pt_booking_id   is not null then 1 else 0 end) = 1);

create index idx_payment_booking on payment (booking_id)    where booking_id    is not null;
create index idx_payment_pt      on payment (pt_booking_id) where pt_booking_id is not null;
```

- [ ] **Step 4: Update the two entities**

In `backend/src/main/java/com/boxhub/box/Booking.java`, make `membershipId` nullable (drop
`nullable = false` from its `@Column`) and add:

```java
    @Column(name = "visitor_user_id") private UUID visitorUserId;
```
```java
    public UUID getVisitorUserId() { return visitorUserId; }
    public void setVisitorUserId(UUID visitorUserId) { this.visitorUserId = visitorUserId; }
```

In `backend/src/main/java/com/boxhub/box/Payment.java`, change
`@Column(name = "subscription_id", nullable = false) private UUID subscriptionId;` to drop
`nullable = false`, and add:

```java
    @Column(name = "booking_id") private UUID bookingId;
    @Column(name = "pt_booking_id") private UUID ptBookingId;
    @Column(name = "payee_membership_id") private UUID payeeMembershipId;
```
```java
    public UUID getBookingId() { return bookingId; }
    public void setBookingId(UUID bookingId) { this.bookingId = bookingId; }
    public UUID getPtBookingId() { return ptBookingId; }
    public void setPtBookingId(UUID ptBookingId) { this.ptBookingId = ptBookingId; }
    public UUID getPayeeMembershipId() { return payeeMembershipId; }
    public void setPayeeMembershipId(UUID payeeMembershipId) { this.payeeMembershipId = payeeMembershipId; }
```

- [ ] **Step 5: Green, then the full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=DropInBookingTest,PaymentSubjectTest > /tmp/m22-t5-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m22-t5-green.txt | tail -2
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t5-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-t5-suite.txt | tail -1
```

Expected: 4 green; full suite **505**, 0 failures, 0 errors.

**The whole existing booking suite must stay green** — `BookingEngineTest`,
`BookingConcurrencyTest`, `BookingCancellationTest`, `BookingEntitlementTest`. If any of them
reddens, the nullability change broke a shipped guarantee; stop and report rather than adjusting
the test.

- [ ] **Step 6: Negative controls, all three, MEASURED**

1. Drop `ck_visitor_not_waitlist` from the migration → `aPayingVisitorCanNotBeWaitlisted` goes RED.
2. Drop `ck_booking_subject` → `aBookingMustHaveExactlyOneSubject` goes RED.
3. Drop `ck_payment_subject` → `aPaymentWithNoProductIsRejected` goes RED.

Because a Flyway migration cannot be edited once applied to the test container, run each control by
editing V26 and letting the throwaway Testcontainers database rebuild from scratch. Paste each
failure line. Restore and re-verify green.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(booking)!: a drop-in is a booking; payment carries exactly one product"
```

---

### Task 6: Social posts, likes and workout ratings

**Owner:** executor (Sonnet).

**Files:**
- Create: `backend/src/main/resources/db/migration/V27__social.sql`
- Create: `backend/src/main/java/com/boxhub/performance/Post.java`
- Create: `backend/src/main/java/com/boxhub/performance/PostRepository.java`
- Create: `backend/src/main/java/com/boxhub/performance/PostLike.java`
- Create: `backend/src/main/java/com/boxhub/performance/PostLikeRepository.java`
- Create: `backend/src/main/java/com/boxhub/performance/WodRating.java`
- Create: `backend/src/main/java/com/boxhub/performance/WodRatingRepository.java`
- Test: `backend/src/test/java/com/boxhub/performance/PostVisibilityTest.java`

**Interfaces:**
- Consumes: `wod` and `memberships` (existing).
- Produces: `Post` (`@TenantId`), `PostLike`, `WodRating` and repositories.

**Why `post` keeps `@TenantId` when `box_photo` dropped it:** drop the discriminator only when the
**whole** table is public. `box_photo` is wholly public. `post` holds **both** `PUBLIC` and `BOX`
rows, so one missed predicate would leak private content. It keeps the discriminator, and the
public feed becomes one registered native query — which M25 writes, not this task.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/performance/PostVisibilityTest.java`:

```java
package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * post keeps @TenantId because it holds BOTH public and box-only rows: dropping the discriminator
 * would put a box-only post one missed predicate away from leaking. M22 spec §3 and §8.
 */
class PostVisibilityTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired PostRepository posts;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("Post " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "COACH")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void aBoxOnlyPostIsInvisibleFromAnotherBox() {
        long n = System.nanoTime();
        Box a = newBox("po-a-" + n);
        Box b = newBox("po-b-" + n);

        User author = new User();
        author.setEmail("po-" + n + "@t.io");
        author.setName("Author");
        author.setPasswordHash("x");
        users.save(author);

        actAsBox(a.getId());
        Membership m = new Membership();
        m.setUser(author); m.setBox(a); m.setRole("COACH");
        UUID authorMembership = memberships.save(m).getId();

        Post p = new Post();
        p.setAuthorMembershipId(authorMembership);
        p.setCaption("Private to box A " + n);
        p.setVisibility("BOX");
        posts.save(p);

        assertThat(posts.findAll()).extracting(Post::getCaption).contains("Private to box A " + n);

        actAsBox(b.getId());
        assertThat(posts.findAll()).extracting(Post::getCaption)
                .doesNotContain("Private to box A " + n);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=PostVisibilityTest > /tmp/m22-t6-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|COMPILATION|ERROR" /tmp/m22-t6-red.txt | head -5
```

Expected: compilation failure — `Post` does not exist.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V27__social.sql`:

```sql
-- M22 spec §8. post is @TenantId because it holds BOTH public and box-only rows: drop the
-- discriminator only when the WHOLE table is public (box_photo is; post is not). The public
-- feed is one registered native query whose WHERE says visibility = 'PUBLIC' — M25 writes it.
--
-- Comment threading is deliberately NOT modelled: it is an open product question, and a thread
-- model built against no screen is what the Phase 1 rule forbids.

create table post (
    id                   uuid primary key default gen_random_uuid(),
    box_id               uuid not null references boxes (id) on delete cascade,
    author_membership_id uuid not null references memberships (id),
    wod_id               uuid references wod (id),
    caption              text,
    visibility           text not null check (visibility in ('PUBLIC', 'BOX')),
    created_at           timestamptz not null default now()
);
create index idx_post_box_created  on post (box_id, created_at desc);
create index idx_post_public       on post (created_at desc) where visibility = 'PUBLIC';

create table post_like (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    post_id    uuid not null references post (id) on delete cascade,
    user_id    uuid not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint uq_post_like unique (post_id, user_id)
);
create index idx_post_like_post on post_like (post_id);

-- The 1-5 dumbbell rating (M25).
create table wod_rating (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    wod_id     uuid not null references wod (id) on delete cascade,
    user_id    uuid not null references users (id) on delete cascade,
    rating     int  not null check (rating between 1 and 5),
    created_at timestamptz not null default now(),
    constraint uq_wod_rating unique (wod_id, user_id)
);
create index idx_wod_rating_wod on wod_rating (wod_id);
```

- [ ] **Step 4: Create the three entities and repositories**

`backend/src/main/java/com/boxhub/performance/Post.java`:

```java
package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId: holds both PUBLIC and BOX rows, so the discriminator stays on. M22 spec §3. */
@Entity
@Table(name = "post")
public class Post {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "author_membership_id", nullable = false) private UUID authorMembershipId;
    @Column(name = "wod_id") private UUID wodId;
    @Column private String caption;
    @Column(nullable = false) private String visibility;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getAuthorMembershipId() { return authorMembershipId; }
    public void setAuthorMembershipId(UUID authorMembershipId) { this.authorMembershipId = authorMembershipId; }
    public UUID getWodId() { return wodId; }
    public void setWodId(UUID wodId) { this.wodId = wodId; }
    public String getCaption() { return caption; }
    public void setCaption(String caption) { this.caption = caption; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/performance/PostLike.java`:

```java
package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId — likes follow their post. M22 spec §8. */
@Entity
@Table(name = "post_like")
public class PostLike {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "post_id", nullable = false) private UUID postId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getPostId() { return postId; }
    public void setPostId(UUID postId) { this.postId = postId; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/performance/WodRating.java`:

```java
package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId — the 1-5 dumbbell rating on a box's wod. M22 spec §8. */
@Entity
@Table(name = "wod_rating")
public class WodRating {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "wod_id", nullable = false) private UUID wodId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(nullable = false) private int rating;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getWodId() { return wodId; }
    public void setWodId(UUID wodId) { this.wodId = wodId; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public int getRating() { return rating; }
    public void setRating(int rating) { this.rating = rating; }
    public Instant getCreatedAt() { return createdAt; }
}
```

```java
// PostRepository.java
package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface PostRepository extends JpaRepository<Post, UUID> {
    List<Post> findByAuthorMembershipIdOrderByCreatedAtDesc(UUID authorMembershipId);
}
```

```java
// PostLikeRepository.java
package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface PostLikeRepository extends JpaRepository<PostLike, UUID> {
    List<PostLike> findByUserId(UUID userId);
    long countByPostId(UUID postId);
}
```

```java
// WodRatingRepository.java
package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface WodRatingRepository extends JpaRepository<WodRating, UUID> {
    List<WodRating> findByUserId(UUID userId);
}
```

- [ ] **Step 5: Green, then the full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=PostVisibilityTest > /tmp/m22-t6-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m22-t6-green.txt | tail -1
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t6-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-t6-suite.txt | tail -1
```

Expected: 1 green; full suite **506**, 0 failures, 0 errors.

- [ ] **Step 6: Negative control**

Remove `@TenantId` from `Post.boxId`. Rerun. Expected: `aBoxOnlyPostIsInvisibleFromAnotherBox` goes **RED** — box B sees box A's private post, which is the leak this classification prevents. Paste the line. Revert, re-verify green.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(social): posts, likes and the workout rating, box-only by discriminator"
```

---

### Task 7: GDPR — export and anonymising delete cover what M22 added

**Owner:** executor (Sonnet). **Orchestrator reviews this diff with particular care** — it is the
one task that changes existing behaviour rather than only adding schema.

**Files:**
- Modify: the service backing `GET /api/me/export` and `DELETE /api/me` (find it — grep below)
- Test: `backend/src/test/java/com/boxhub/identity/AccountDeletionTest.java` (extend)

**Interfaces:**
- Consumes: `CoachProfile`, `CoachAvailability`, `CoachTimeOff`, `CoachStripe` (Task 3);
  `PtBooking` (Task 4); `Booking.visitorUserId` (Task 5); `Post`, `PostLike`, `WodRating` (Task 6).

**This is Phase 1's single deliberate exception**, and the spec mandates it: the project is the
processor and EU gyms are the controllers, so export and delete are not optional extras. It adds no
new route.

- [ ] **Step 1: Find the real code**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "export\|anonymize" backend/src/main/java/com/boxhub/identity/AccountService.java | head -20
```

Read the existing export assembly and the anonymise path before writing anything. **If the shape
differs from what this task assumes, STOP and report to the orchestrator rather than improvising.**

- [ ] **Step 2: Write the failing tests**

Append to `backend/src/test/java/com/boxhub/identity/AccountDeletionTest.java`, matching that
file's existing fixture style:

```java
    @Test
    void deletingAnAccountRemovesItsCoachProfileSoNoPublicPageKeepsTheName() {
        // Spec D7's payoff: the coach OWNS this row, so removal is a single delete with no
        // cross-entity cascade and no orphaned name left on a box's public page.
        UUID coach = /* the user id this test class already creates */ existingUserId();

        CoachProfile p = new CoachProfile();
        p.setUserId(coach);
        p.setBio("Should not survive deletion");
        p.setPublished(true);
        coachProfiles.saveAndFlush(p);

        accountService.anonymize(coach);

        assertThat(coachProfiles.findById(coach)).isEmpty();
    }

    @Test
    void anExportNeverContainsTheCoachStripeSecret() {
        UUID coach = existingUserId();

        CoachStripe s = new CoachStripe();
        s.setUserId(coach);
        s.setRestrictedKeyEnc("enc:super-secret-value");
        s.setWebhookSecretEnc("enc:webhook-secret-value");
        coachStripes.saveAndFlush(s);

        String json = accountService.export(coach).toString();

        assertThat(json).doesNotContain("super-secret-value");
        assertThat(json).doesNotContain("webhook-secret-value");
    }
```

> `existingUserId()`, `accountService`, and the export return type must be replaced with whatever
> `AccountDeletionTest` and `AccountService` actually provide — read them in Step 1. Do **not**
> invent an API. If `export` returns a DTO rather than something with a useful `toString`,
> serialise it with the injected `ObjectMapper` the way the surrounding tests do.

- [ ] **Step 3: Run and watch fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AccountDeletionTest > /tmp/m22-t7-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run:|FAIL" /tmp/m22-t7-red.txt | tail -3
```

- [ ] **Step 4: Implement**

In the export assembly, add: coach profile, availability, time off, PT bookings **in both roles**
(as `coachMembershipId` and as `athleteUserId`), visitor bookings (`Booking.visitorUserId`), posts,
likes and ratings. For `coach_stripe` export **existence only** — a boolean, never the encrypted
key or the webhook secret.

In the anonymise path, add: delete `coach_profile`, delete `coach_stripe`, delete
`coach_availability` and `coach_time_off` for that user. Posts, likes and ratings are
**anonymised, not deleted** — the same treatment the shipped code already gives bookings, scores
and lifts, so a box's feed does not develop holes.

- [ ] **Step 5: Green and full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-t7-suite.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-t7-suite.txt | tail -1
```

Expected: **508**, 0 failures, 0 errors. `anonymizationLeavesBookingsScoresAndLiftsIntact` must
stay green — if it reddens, the new deletions went too far.

- [ ] **Step 6: Negative control**

Remove the `coach_profile` delete from the anonymise path →
`deletingAnAccountRemovesItsCoachProfileSoNoPublicPageKeepsTheName` goes RED. Then re-add it and
remove the export redaction → `anExportNeverContainsTheCoachStripeSecret` goes RED. Paste both.
Revert and re-verify green.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(gdpr): export and anonymising delete cover the M22 domains"
```

---

### Task 8: Documentation, gates and merge

**Owner:** ORCHESTRATOR.

**Files:**
- Modify: `docs/TENANCY.md`
- Modify: `docs/HANDOFF.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/progress.md`
- Modify: `.superpowers/sdd/NEXT-SESSION.md`

- [ ] **Step 1: Update `docs/TENANCY.md`**

Add an M22 section recording:

1. **The classification rule and its refinement**, verbatim from spec §3: the directory query
   decides; drop `@TenantId` only when the **whole** table is public, otherwise keep the
   discriminator and use one narrow registered native read.
2. **The three cross-box reads named but NOT built** (spec §3.2), each with its owning milestone —
   "my drop-ins across every box" (M23/M24), the coach's real free slots (**M26**, deferred by D14),
   and the public social feed (M25). State that each must be a registered native query and that
   `runAsRoot` is never the answer on a request thread.
3. **Which M22 tables are `@TenantId` and which are not**, with the reason per class.
4. **D14's assumption and its trigger:** a coach works at one box for now; the first coach holding a
   COACH membership at two boxes needs the cross-box availability read and **no migration**. Until
   then, such a coach would show as free at Box A while booked at Box B.

- [ ] **Step 2: Gates**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m22-gate-backend.txt 2>&1; echo "exit=$?"; grep -E "^\[INFO\] Tests run:.*Skipped: [0-9]+$" /tmp/m22-gate-backend.txt | tail -1
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "private .*runAsBox" backend/src/main/java > /tmp/m22-g1.txt 2>&1; echo "local-runAsBox=$(wc -l < /tmp/m22-g1.txt)"
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' > /tmp/m22-g2.txt 2>&1; echo "root-in-controllers=$(wc -l < /tmp/m22-g2.txt)"
```

Expected: backend **508 / 0 / 0**; both greps `0`.

Frontend is untouched by this milestone, so Karma must stay at **412** and the production build
green. e2e must stay at **64 passed + 1 skipped** and `e2e/visual.sh` at **31 specs with zero dirty
baselines** — nothing here renders, so a dirty baseline means scope leaked.

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m22-gate-karma.txt 2>&1; echo "exit=$?"; grep -E "Executed" /tmp/m22-gate-karma.txt | tail -1
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml down -v > /dev/null 2>&1; docker compose -f docker/docker-compose.yml up -d --build > /tmp/m22-gate-up.txt 2>&1; echo "up=$?"
cd /Users/alessandrolomonaco/dev/boxhub/e2e && npx playwright test > /tmp/m22-gate-e2e.txt 2>&1; echo "exit=$?"; tail -4 /tmp/m22-gate-e2e.txt
cd /Users/alessandrolomonaco/dev/boxhub/e2e && ./visual.sh > /tmp/m22-gate-visual.txt 2>&1; echo "exit=$?"; tail -4 /tmp/m22-gate-visual.txt
```

- [ ] **Step 3: Migration replay from empty**

The single most important gate in a schema milestone: `down -v` in Step 2 already destroyed the
volume, so the stack that came up replayed **V1 through V27 on an empty database**. Confirm the
backend became healthy — that is the proof the migration chain applies cleanly from scratch, not
just as a delta on a developer's existing database.

```bash
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml ps --format '{{.Service}} {{.State}} {{.Health}}'
```

Expected: `backend running healthy`.

- [ ] **Step 4: Push and read CI**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git push -u origin m22-new-domain-schema
```

CI runs on `push: main` and `pull_request` only, so a branch push starts nothing. Per the M21
precedent the user chose, merge to `main` and read the run there. **A local green is not the gate.**

- [ ] **Step 5: Merge**

Use `superpowers:finishing-a-development-branch`. Executors never self-merge.

- [ ] **Step 6: Rewrite `.superpowers/sdd/NEXT-SESSION.md`** for the next milestone in
`docs/ROADMAP-AT-A-GLANCE.md`'s execution order — **M13f opens Phase 2**. It is the ONLY session
prompt; do not create a second one.

---

## Self-Review

**Spec coverage.** §2 D1/D2/D3 → Task 5's `payee_membership_id` plus the shipped `payment.method`.
D4/D13 → Task 5's `ck_visitor_not_waitlist` and the absence of any entitlement table. D5 → Task 4's
`room_id` on `pt_booking`. D6 → Task 1's `published`. D7 → Task 3's `coach_profile.published` and
Task 7's deletion test. D8 → Task 1's `lat`/`lng` and indexes. D9 → **no task**; see the gap below.
D10 → Task 5. D11 → Task 2. D12 → no code by design, documented in Task 8. D14 → Task 3's test and
Task 8's documentation. §3 classification → every task's entity annotation plus its tenancy test.
§4 → Task 1. §5 → Task 2. §6 → Tasks 3 and 4. §7 → Task 5. §8 → Task 6. §9 → Task 7. §10 → nothing
built, recorded in Task 8. §11 → the recorded deviation at the top. §12 → each task's test. §13 →
Task 8's TENANCY.md section.

**Gap found and closed by adding it here rather than silently dropping it:** spec §2 D9 (the
`/media/pub/` nginx location and storage subdirectory) has **no task**. It is infra rather than
schema, it has no writer until M24, and no test in this plan exercises it. **Decision: it is
deferred to M24 with the rest of the media work, and spec §2 D9 and §13 must be amended to say so
before Task 1 begins.** Shipping an nginx location nothing writes to, and nothing tests, is exactly
the speculative work Phase 1's own rule forbids. The orchestrator makes that spec edit as step zero.

**Placeholder scan:** Task 7 Steps 2 and 4 intentionally instruct the executor to read the real
`AccountService` before writing, because this plan's author did not read it. That is a *named
unknown with a stop instruction*, not a placeholder — the executor is told to escalate rather than
improvise. Every other step carries real SQL, real Java and real commands.

**Type consistency:** `CoachProfile.userId` is the `@Id` in Task 3 and is what Task 7's test looks
up by. `PtBooking.coachMembershipId` (Task 4) matches `payment.payee_membership_id` (Task 5) — both
memberships. `Booking.visitorUserId` is created in Task 5 and consumed by Task 7. `Room` is created
in Task 2 and its table is the FK target of `pt_booking.room_id` in Task 4, so Task 2 must precede
Task 4. `pt_booking` (Task 4) is the FK target of `payment.pt_booking_id` (Task 5), so Task 4 must
precede Task 5. Migration order V22→V27 matches task order 1→6.

## Task Dependencies

```
Task 1 (V22, box profile)   ─┐
Task 2 (V23, rooms)         ─┼─→ Task 4 (V25, pt_booking; needs room from T2)
Task 3 (V24, coach)         ─┘        │
                                      ↓
                              Task 5 (V26, drop-in + payment; needs pt_booking from T4)
                                      │
Task 6 (V27, social) ─────────────────┤
                                      ↓
                              Task 7 (GDPR; needs T3, T4, T5, T6)
                                      ↓
                              Task 8 (docs, gates, merge)
```

Tasks 1, 2, 3 and 6 are independent of each other. Tasks 4, 5, 7 and 8 are strictly ordered.
Because each owns its own migration file, parallel work causes no file conflicts — but the Flyway
version numbers must stay in task order, so a task that lands out of order renumbers its migration.
