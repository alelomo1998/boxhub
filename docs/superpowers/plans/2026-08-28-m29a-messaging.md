# M29a Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship staff↔member 1:1 messaging with a staff shared inbox, and grow the existing `Announcement` entity into segmented, append-only announcements with per-recipient read state.

**Architecture:** One `message_thread` row per member per box, shared by all staff, with a single staff-side read marker and a member-side one. Announcements become append-only sends whose audience is resolved once, at send, into `announcement_recipient` rows. No SSE — screens poll while visible. No events emitted; M29b layers its notification feed on top.

**Tech Stack:** Spring Boot 3.5 / Java 21 / Postgres 16 / Flyway, Angular 22 (standalone components, signals), Karma, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-m29a-messaging-design.md` — executors read both. Every decision D-1..D-8 and every §4 rule is binding.

---

## Global Constraints

Copied verbatim from the spec and CLAUDE.md. **Every task's requirements implicitly include this section.**

- **`NODE_OPTIONS` is poisoned.** Every bare `npm`/`npx`/`node` command dies with `MODULE_NOT_FOUND` before anything starts. Always `env -u NODE_OPTIONS …`.
- **There is no `./mvnw`.** Backend gate: `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test`.
- **Bash cwd persists between tool calls AND sometimes resets. Absolute paths everywhere.**
- **Stage explicit paths. Never `git add -A`** — it silently swallowed two executors' in-flight diffs.
- **Do NOT create a git worktree.** `git worktree list` must show exactly one entry.
- **Schema changes only via Flyway. Never edit an applied migration.** `V29` is applied; `V30` is this milestone's.
- **Tenancy:** resolve tenant ONLY from the JWT via `TenantContext`, never from request params. No `runAsRoot` in a controller.
- **`@TenantId` is box-scoping, NOT member-scoping** (spec §4). A finder that loses `AND membership_id = :me` leaks private correspondence past a green suite.
- **Four tests per messaging endpoint:** happy + auth-denied + cross-tenant-denied + **cross-member-denied**.
- **`AuthzConformanceTest`:** the only permitted edit is registering a route in `MIN_ROLE`. **The orchestrator audits this edit personally — an executor that needs it must escalate, not edit.**
- **Tokens only.** No raw hex, no raw px type sizes, outside `frontend/src/styles/_tokens.scss`.
- **No volt on these screens.** The box switcher's mark already spent the shell's volt budget. These are plumbing screens.
- **Mono (JetBrains Mono) for anything counted or measured; banned from prose.** Message bodies are prose → Archivo.
- **`(ngSubmit)` DIES WITH `FormsModule`.** Use `<form (submit)="submit($event)" novalidate>` with `event.preventDefault()`. `bh-field`/`bh-select` are NOT `ControlValueAccessor`s — bind `[(value)]` against signals.
- **A disabled button guards ONE path, never the action.** Put the guard in the handler.
- **i18n:** every user-facing string marked with `$localize` and a stable `@@id`. No new hardcoded `€`.
- **Escalate, do not improvise.** Blocked / ambiguous / plan-conflicts-with-reality → return the question. Three M23 executors escalated and all three were right.

### Standing greps that must stay empty

```sh
cd ~/dev/boxhub
grep -rn "memberships\.findAll()" backend/src/main/java
grep -rn "MembershipEvent.LEFT" backend/src/main/java
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'
grep -rn "messageThreads\.findAll()\|messages\.findAll()\|announcementRecipients\.findAll()" backend/src/main/java
```

The fourth is new in this milestone (spec §4).

---

## File Structure

**Backend — create:**

| File | Responsibility |
|---|---|
| `backend/src/main/resources/db/migration/V30__messaging.sql` | Schema + backfill |
| `.../com/boxhub/messaging/MessageThread.java` | Thread entity |
| `.../com/boxhub/messaging/Message.java` | Message entity |
| `.../com/boxhub/messaging/MessageThreadRepository.java` | Member-scoped + staff finders |
| `.../com/boxhub/messaging/MessageRepository.java` | Messages by thread |
| `.../com/boxhub/messaging/MessagingService.java` | Send/read/thread-resolution, the ONE place denormalised columns are written |
| `.../com/boxhub/messaging/MyThreadController.java` | `/api/box/me/thread**` — no path ids |
| `.../com/boxhub/messaging/StaffInboxController.java` | `/api/box/threads**` — `requireStaff()` |
| `.../com/boxhub/box/AnnouncementRecipient.java` | Recipient entity |
| `.../com/boxhub/box/AnnouncementRecipientRepository.java` | Member-scoped finders |
| `.../com/boxhub/box/SegmentResolver.java` | The three segments, one place |
| `.../com/boxhub/box/AnnouncementService.java` | Send = resolve + fan out, in one transaction |

**Backend — modify:** `Announcement.java`, `AnnouncementController.java` (rewritten), `AnnouncementRepository.java`, `HomeController.java`, `MemberController.java` (constant promoted), `AuthzConformanceTest.java` (`MIN_ROLE` only, orchestrator-audited).

**Frontend — create:** `features/messaging/messaging.service.ts`, `messaging.models.ts`, `athlete-messages.page.ts`(+spec), `staff-inbox.page.ts`(+spec), `announcements.page.ts`(+spec).
**Frontend — modify:** `app.routes.ts`, `athlete-shell.page.ts` (header envelope), `coach-shell.page.ts`, `admin-shell.page.ts`, `home.service.ts` (delete two dead methods).

**Why `messaging/` is its own package:** threads and messages are a subsystem with one responsibility. Announcements stay in `box/` because they extend an entity that already lives there and share `Membership`/`Booking`/`Subscription` reads with it.

---

## Task 1: `V30` migration and backfill

**Files:**
- Create: `backend/src/main/resources/db/migration/V30__messaging.sql`
- Test: `backend/src/test/java/com/boxhub/messaging/MessagingMigrationTest.java`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: tables `message_thread`, `message`, `announcement_recipient`; `announcement` gains `segment`, `segment_ref`, `sent_at`, `sent_by` and loses its `box_id` unique constraint.

- [ ] **Step 1: Write the migration**

Create `backend/src/main/resources/db/migration/V30__messaging.sql`:

```sql
-- M29a: staff<->member messaging, a staff shared inbox, and announcements grown up.
-- docs/superpowers/specs/2026-08-28-m29a-messaging-design.md
--
-- Tenancy note (spec §4): every table here is @TenantId on the entity side, which is BOX-scoping,
-- not MEMBER-scoping. Both sides of a member-to-member leak sit in the same box, so the tenant
-- filter passes it. Member scoping is enforced in the repository finders and proved by the
-- cross-member-denied tests. The schema cannot enforce it; do not assume it does.

-- ── announcement: one overwritten row per box becomes append-only history ─────
-- V7 gave box_id a UNIQUE constraint, which is exactly what "one row, overwritten" meant.
-- History requires many rows per box, so it goes. Postgres named it announcement_box_id_key.
alter table announcement drop constraint announcement_box_id_key;

-- Renamed rather than re-added: the columns already hold the right values, and "updated" is a lie
-- once rows are never updated again.
alter table announcement rename column updated_at to sent_at;
alter table announcement rename column updated_by to sent_by;

alter table announcement add column segment text not null default 'EVERYONE';
alter table announcement alter column segment drop default;
alter table announcement add column segment_ref uuid references class_sessions(id);
alter table announcement add constraint announcement_segment_check
    check (segment in ('EVERYONE','CLASS_ROSTER','EXPIRING'));
-- CLASS_ROSTER is the only segment that names a target; the other two must not carry a stale one.
alter table announcement add constraint announcement_segment_ref_check
    check ((segment = 'CLASS_ROSTER') = (segment_ref is not null));

create index idx_announcement_box_sent on announcement(box_id, sent_at desc);

-- ── announcement_recipient: the audience, frozen at send (D-2) ───────────────
create table announcement_recipient (
    id              uuid primary key default gen_random_uuid(),
    box_id          uuid not null references boxes(id),
    announcement_id uuid not null references announcement(id) on delete cascade,
    membership_id   uuid not null references memberships(id),
    read_at         timestamptz,
    constraint uq_announcement_recipient unique (announcement_id, membership_id)
);
create index idx_ann_recipient_membership on announcement_recipient(membership_id);

-- ── message_thread: exactly one per member per box (D-1) ─────────────────────
create table message_thread (
    id                      uuid primary key default gen_random_uuid(),
    box_id                  uuid not null references boxes(id),
    membership_id           uuid not null references memberships(id),
    created_at              timestamptz not null default now(),
    last_message_at         timestamptz,
    last_message_from_staff boolean not null default false,
    member_last_read_at     timestamptz,
    -- ONE marker, shared by every staff member (D-3). Coach A reading clears it for the team.
    staff_last_read_at      timestamptz,
    constraint uq_message_thread_member unique (box_id, membership_id)
);
create index idx_message_thread_inbox on message_thread(box_id, last_message_at desc);

-- ── message ─────────────────────────────────────────────────────────────────
create table message (
    id                   uuid primary key default gen_random_uuid(),
    box_id               uuid not null references boxes(id),
    thread_id            uuid not null references message_thread(id) on delete cascade,
    sender_membership_id uuid not null references memberships(id),
    -- Stored, never derived from the sender's CURRENT role: a message sent as a member stays a
    -- member message after that person is promoted to coach. Same reasoning as the frozen audience.
    sender_side          text not null check (sender_side in ('MEMBER','STAFF')),
    body                 text not null,
    created_at           timestamptz not null default now()
);
create index idx_message_thread_created on message(thread_id, created_at);

-- ── backfill: no existing announcement is lost to this migration ─────────────
-- Every pre-M29a row was, by construction, box-wide and addressed to everyone. It becomes one
-- EVERYONE send (the column default above already set segment), fanned out to the box's ACTIVE
-- memberships so it keeps appearing on athlete home, which now reads through recipient rows.
insert into announcement_recipient (box_id, announcement_id, membership_id)
select a.box_id, a.id, m.id
  from announcement a
  join memberships m on m.box_id = a.box_id and m.status = 'ACTIVE';
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/test/java/com/boxhub/messaging/MessagingMigrationTest.java`:

```java
package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V30 schema facts. Flyway has already run against the container by the time this executes. */
class MessagingMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void announcementNoLongerUniquePerBox() {
        // The whole point of D-4: history needs many rows per box.
        Integer n = jdbc.queryForObject("""
                select count(*) from pg_constraint
                 where conname = 'announcement_box_id_key'
                """, Integer.class);
        assertThat(n).isZero();
    }

    @Test
    void announcementCarriesSegmentColumns() {
        assertThat(columnExists("announcement", "segment")).isTrue();
        assertThat(columnExists("announcement", "segment_ref")).isTrue();
        assertThat(columnExists("announcement", "sent_at")).isTrue();
        assertThat(columnExists("announcement", "sent_by")).isTrue();
        assertThat(columnExists("announcement", "updated_at")).isFalse();
    }

    @Test
    void segmentRefIsRequiredExactlyForClassRoster() {
        // EVERYONE with a dangling ref is a contradiction the check constraint must reject.
        assertThatThrownBy(() -> jdbc.update("""
                insert into announcement (box_id, body, segment, segment_ref, sent_at)
                values (gen_random_uuid(), 'x', 'EVERYONE', gen_random_uuid(), now())
                """)).isInstanceOf(Exception.class);
    }

    @Test
    void messagingTablesExist() {
        assertThat(tableExists("message_thread")).isTrue();
        assertThat(tableExists("message")).isTrue();
        assertThat(tableExists("announcement_recipient")).isTrue();
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbc.queryForObject(
                "select count(*) from information_schema.columns where table_name = ? and column_name = ?",
                Integer.class, table, column);
        return n != null && n > 0;
    }

    private boolean tableExists(String table) {
        Integer n = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = ?",
                Integer.class, table);
        return n != null && n > 0;
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  mvn -q test -Dtest=MessagingMigrationTest
```

Expected before the migration file exists: FAIL — `announcementCarriesSegmentColumns` reports `segment` missing.

**If it fails with a Flyway checksum error instead, STOP and escalate.** That means a migration was edited rather than added, which is a repo rule violation, not a test problem.

- [ ] **Step 4: Run it and watch it pass**

Same command. Expected: 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```sh
cd ~/dev/boxhub && git add \
  backend/src/main/resources/db/migration/V30__messaging.sql \
  backend/src/test/java/com/boxhub/messaging/MessagingMigrationTest.java && \
git commit -m "feat(m29a): V30 — messaging tables, announcement history, audience backfill"
```

---

## Task 2: Entities and member-scoped repositories

**Files:**
- Create: `backend/src/main/java/com/boxhub/messaging/MessageThread.java`, `Message.java`, `MessageThreadRepository.java`, `MessageRepository.java`
- Create: `backend/src/main/java/com/boxhub/box/AnnouncementRecipient.java`, `AnnouncementRecipientRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/Announcement.java`
- Test: `backend/src/test/java/com/boxhub/messaging/ThreadScopingTest.java`

**Interfaces:**
- Consumes: Task 1's tables.
- Produces:
  - `MessageThreadRepository.findByMembershipId(UUID) -> Optional<MessageThread>`
  - `MessageThreadRepository.findAllByOrderByLastMessageAtDesc() -> List<MessageThread>`
  - `MessageRepository.findByThreadIdOrderByCreatedAtAsc(UUID) -> List<Message>`
  - `AnnouncementRecipientRepository.findByMembershipIdAndAnnouncementId(UUID, UUID) -> Optional<AnnouncementRecipient>`
  - `AnnouncementRecipientRepository.findLatestBodyForMember(UUID, Pageable) -> List<Announcement>`
  - `Announcement` getters: `getSegment()`, `getSegmentRef()`, `getSentAt()`, `getSentBy()`

- [ ] **Step 1: Write the entities**

`backend/src/main/java/com/boxhub/messaging/MessageThread.java`:

```java
package com.boxhub.messaging;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * One thread per member per box, shared by all staff (D-1). The staff side is "the box", not a
 * person: replies are attributed per message via Message.senderMembershipId.
 *
 * lastMessageAt / lastMessageFromStaff are DENORMALISED so the shared inbox list is one query with
 * no N+1. They are written only by MessagingService, in the same transaction as the message insert,
 * so they cannot drift. Do not set them anywhere else.
 */
@Entity
@Table(name = "message_thread")
public class MessageThread {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "last_message_at") private Instant lastMessageAt;
    @Column(name = "last_message_from_staff", nullable = false) private boolean lastMessageFromStaff;
    @Column(name = "member_last_read_at") private Instant memberLastReadAt;
    /** ONE marker for the whole staff (D-3). Coach A reading clears the thread for the team. */
    @Column(name = "staff_last_read_at") private Instant staffLastReadAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID membershipId) { this.membershipId = membershipId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastMessageAt() { return lastMessageAt; }
    public void setLastMessageAt(Instant lastMessageAt) { this.lastMessageAt = lastMessageAt; }
    public boolean isLastMessageFromStaff() { return lastMessageFromStaff; }
    public void setLastMessageFromStaff(boolean v) { this.lastMessageFromStaff = v; }
    public Instant getMemberLastReadAt() { return memberLastReadAt; }
    public void setMemberLastReadAt(Instant v) { this.memberLastReadAt = v; }
    public Instant getStaffLastReadAt() { return staffLastReadAt; }
    public void setStaffLastReadAt(Instant v) { this.staffLastReadAt = v; }

    /** Derived, never stored (spec §3). No status column, nothing to leave in the wrong state. */
    public boolean needsReply() {
        return !lastMessageFromStaff && lastMessageAt != null
                && (staffLastReadAt == null || lastMessageAt.isAfter(staffLastReadAt));
    }
}
```

`backend/src/main/java/com/boxhub/messaging/Message.java`:

```java
package com.boxhub.messaging;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "message")
public class Message {
    /** Frozen at send. NOT derived from the sender's current role — see MessagingService. */
    public static final String MEMBER = "MEMBER";
    public static final String STAFF = "STAFF";

    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "thread_id", nullable = false) private UUID threadId;
    @Column(name = "sender_membership_id", nullable = false) private UUID senderMembershipId;
    @Column(name = "sender_side", nullable = false) private String senderSide;
    @Column(nullable = false) private String body;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getThreadId() { return threadId; }
    public void setThreadId(UUID threadId) { this.threadId = threadId; }
    public UUID getSenderMembershipId() { return senderMembershipId; }
    public void setSenderMembershipId(UUID v) { this.senderMembershipId = v; }
    public String getSenderSide() { return senderSide; }
    public void setSenderSide(String senderSide) { this.senderSide = senderSide; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/box/AnnouncementRecipient.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** One row per member the announcement was sent to. The audience, frozen at send (D-2). */
@Entity
@Table(name = "announcement_recipient")
public class AnnouncementRecipient {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "announcement_id", nullable = false) private UUID announcementId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "read_at") private Instant readAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getAnnouncementId() { return announcementId; }
    public void setAnnouncementId(UUID v) { this.announcementId = v; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant readAt) { this.readAt = readAt; }
}
```

- [ ] **Step 2: Update `Announcement.java`**

Replace the body of `backend/src/main/java/com/boxhub/box/Announcement.java` with:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** One announcement SEND. Append-only history since M29a — never updated in place (D-4). */
@Entity
@Table(name = "announcement")
public class Announcement {
    public static final String EVERYONE = "EVERYONE";
    public static final String CLASS_ROSTER = "CLASS_ROSTER";
    public static final String EXPIRING = "EXPIRING";

    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String body;
    @Column(nullable = false) private String segment = EVERYONE;
    /** class_sessions(id) when segment is CLASS_ROSTER, null otherwise — DB check enforces it. */
    @Column(name = "segment_ref") private UUID segmentRef;
    @Column(name = "sent_by") private UUID sentBy;
    @Column(name = "sent_at", nullable = false) private Instant sentAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getSegment() { return segment; }
    public void setSegment(String segment) { this.segment = segment; }
    public UUID getSegmentRef() { return segmentRef; }
    public void setSegmentRef(UUID segmentRef) { this.segmentRef = segmentRef; }
    public UUID getSentBy() { return sentBy; }
    public void setSentBy(UUID sentBy) { this.sentBy = sentBy; }
    public Instant getSentAt() { return sentAt; }
    public void setSentAt(Instant sentAt) { this.sentAt = sentAt; }
}
```

- [ ] **Step 3: Write the repositories**

`backend/src/main/java/com/boxhub/messaging/MessageThreadRepository.java`:

```java
package com.boxhub.messaging;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessageThreadRepository extends JpaRepository<MessageThread, UUID> {

    /**
     * THE member-scoped finder (spec §4). @TenantId box-filters this; the membershipId predicate is
     * what stops member B reading member A's thread — both are in the same box, so the tenant filter
     * passes either way. Never replace this with findAll() and a filter in the caller.
     */
    Optional<MessageThread> findByMembershipId(UUID membershipId);

    /**
     * The staff shared inbox. Box-filtered by @TenantId and reachable only behind
     * RoleGuard.requireStaff(), so returning every thread in the box IS the intent here.
     * Deliberately not named findAll() — that name is a banned grep for this package.
     */
    List<MessageThread> findAllByOrderByLastMessageAtDesc();
}
```

`backend/src/main/java/com/boxhub/messaging/MessageRepository.java`:

```java
package com.boxhub.messaging;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    /** Callers must already have proved the thread belongs to the caller. */
    List<Message> findByThreadIdOrderByCreatedAtAsc(UUID threadId);
}
```

`backend/src/main/java/com/boxhub/box/AnnouncementRecipientRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AnnouncementRecipientRepository extends JpaRepository<AnnouncementRecipient, UUID> {

    /** Member-scoped (spec §4): a member marking an announcement read can only reach their OWN row. */
    Optional<AnnouncementRecipient> findByMembershipIdAndAnnouncementId(UUID membershipId, UUID announcementId);

    /** Every announcement addressed to this member, newest first. Member-scoped. */
    @Query("""
           select r from AnnouncementRecipient r
            where r.membershipId = :mid
           """)
    List<AnnouncementRecipient> findMineRaw(@Param("mid") UUID membershipId);

    /**
     * The athlete home card: the newest announcement ADDRESSED TO ME (D-4). Entity join —
     * Hibernate 6 supports `join Entity alias on …` without a mapped association. Both entities are
     * @TenantId, so the box filter applies to both sides.
     * Call with PageRequest.of(0, 1).
     */
    @Query("""
           select a from Announcement a
             join AnnouncementRecipient r on r.announcementId = a.id
            where r.membershipId = :mid
            order by a.sentAt desc
           """)
    List<Announcement> findLatestBodyForMember(@Param("mid") UUID membershipId, Pageable page);

    long countByAnnouncementId(UUID announcementId);
    long countByAnnouncementIdAndReadAtIsNotNull(UUID announcementId);
}
```

- [ ] **Step 4: Update `AnnouncementRepository.java`**

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {
    /** History, newest first. Box-filtered by @TenantId; staff-only surface. */
    List<Announcement> findAllByOrderBySentAtDesc();
}
```

- [ ] **Step 5: Write the failing scoping test**

Create `backend/src/test/java/com/boxhub/messaging/ThreadScopingTest.java`:

```java
package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.boxhub.shared.TenantContext;
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
 * The guarantee @TenantId does NOT give us (spec §4): two members of the SAME box must not see each
 * other's thread. Negative control: delete the membershipId predicate from
 * MessageThreadRepository.findByMembershipId and `memberBCannotSeeMemberAsThread` must go red.
 */
class ThreadScopingTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired MessageThreadRepository threads;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    @Test
    void memberBCannotSeeMemberAsThread() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Scope Box " + n);
        box.setSlug("scope-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);

        User ua = authService.register("sa-" + n + "@t.io", "correct-horse-battery", "A");
        User ub = authService.register("sb-" + n + "@t.io", "correct-horse-battery", "B");
        Membership a = member(ua, box);
        Membership b = member(ub, box);

        actAsBox(box.getId());
        MessageThread t = new MessageThread();
        t.setMembershipId(a.getId());
        threads.save(t);

        // Same box, so the tenant filter passes for both. Only the membershipId predicate separates
        // them — that is the whole point of this test.
        assertThat(threads.findByMembershipId(a.getId())).isPresent();
        assertThat(threads.findByMembershipId(b.getId())).isEmpty();
    }

    private Membership member(User u, Box box) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }
}
```

- [ ] **Step 6: Run and verify it passes**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  mvn -q test -Dtest='ThreadScopingTest,MessagingMigrationTest'
```

- [ ] **Step 7: Run the negative control and BELIEVE it**

Temporarily change `findByMembershipId` to `findAllByOrderByLastMessageAtDesc().stream().findFirst()` in the test. `memberBCannotSeeMemberAsThread` MUST fail. Revert. **If it passes, the test is worthless — say so and escalate.**

- [ ] **Step 8: Commit**

```sh
cd ~/dev/boxhub && git add \
  backend/src/main/java/com/boxhub/messaging/ \
  backend/src/main/java/com/boxhub/box/Announcement.java \
  backend/src/main/java/com/boxhub/box/AnnouncementRecipient.java \
  backend/src/main/java/com/boxhub/box/AnnouncementRecipientRepository.java \
  backend/src/main/java/com/boxhub/box/AnnouncementRepository.java \
  backend/src/test/java/com/boxhub/messaging/ThreadScopingTest.java && \
git commit -m "feat(m29a): messaging entities and member-scoped repositories"
```

---

## Task 3: `MessagingService` and the member thread API

**Files:**
- Create: `backend/src/main/java/com/boxhub/messaging/MessagingService.java`, `MyThreadController.java`
- Test: `backend/src/test/java/com/boxhub/messaging/MyThreadApiTest.java`

**Interfaces:**
- Consumes: Task 2's entities and repositories.
- Produces:
  - `MessagingService.threadFor(UUID membershipId) -> MessageThread` (creates if absent)
  - `MessagingService.send(UUID membershipId, UUID senderMembershipId, String side, String body) -> Message`
  - `MessagingService.markRead(UUID membershipId, boolean staffSide)`
  - `MyThreadController.ThreadDto(UUID id, List<MessageDto> messages, Instant memberLastReadAt)`
  - `MyThreadController.MessageDto(UUID id, String body, String senderSide, String senderName, Instant createdAt)`

- [ ] **Step 1: Write `MessagingService`**

```java
package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * The ONE place message rows and the thread's denormalised columns are written together, so they
 * cannot drift (spec §3). Nothing else may set lastMessageAt or lastMessageFromStaff.
 */
@Service
public class MessagingService {

    private final MessageThreadRepository threads;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public MessagingService(MessageThreadRepository threads, MessageRepository messages,
                            MembershipRepository memberships) {
        this.threads = threads;
        this.messages = messages;
        this.memberships = memberships;
    }

    /** One thread per member per box (D-1). Created lazily on first send, by either side. */
    @Transactional
    public MessageThread threadFor(UUID membershipId) {
        return threads.findByMembershipId(membershipId).orElseGet(() -> {
            MessageThread t = new MessageThread();
            t.setMembershipId(membershipId);
            return threads.save(t);
        });
    }

    @Transactional
    public Message send(UUID membershipId, UUID senderMembershipId, String side, String body) {
        MessageThread t = threadFor(membershipId);
        Instant now = Instant.now();

        Message m = new Message();
        m.setThreadId(t.getId());
        m.setSenderMembershipId(senderMembershipId);
        // Frozen at send: a promotion later must not rewrite who this came from.
        m.setSenderSide(side);
        m.setBody(body.trim());
        messages.save(m);

        t.setLastMessageAt(now);
        t.setLastMessageFromStaff(Message.STAFF.equals(side));
        // The sender has, by definition, read their own message.
        if (Message.STAFF.equals(side)) t.setStaffLastReadAt(now); else t.setMemberLastReadAt(now);
        threads.save(t);
        return m;
    }

    @Transactional
    public void markRead(UUID membershipId, boolean staffSide) {
        MessageThread t = threadFor(membershipId);
        if (staffSide) t.setStaffLastReadAt(Instant.now()); else t.setMemberLastReadAt(Instant.now());
        threads.save(t);
    }

    /** The caller's own membership in the box they are acting in. Never from a request param. */
    public Membership callerMembership() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "Not a member of this box"));
    }
}
```

- [ ] **Step 2: Write `MyThreadController`**

```java
package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The member's own thread. NO PATH IDS ANYWHERE (spec §4, countermeasure 3): the membership is
 * resolved from the JWT, so there is nothing in the URL to tamper with and no member can name
 * another member. This is what makes "no member<->member" structural rather than a rule.
 */
@RestController
@RequestMapping("/api/box/me/thread")
public class MyThreadController {

    private final MessagingService messaging;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public MyThreadController(MessagingService messaging, MessageRepository messages,
                              MembershipRepository memberships) {
        this.messaging = messaging;
        this.messages = messages;
        this.memberships = memberships;
    }

    public record MessageDto(UUID id, String body, String senderSide, String senderName, Instant createdAt) {}
    public record ThreadDto(UUID id, List<MessageDto> messages, Instant memberLastReadAt) {}
    record SendRequest(@NotBlank @Size(max = 4000) String body) {}

    /** Always 200, never 204 (spec §6): "no thread yet" is an empty state, not a missing resource. */
    @GetMapping
    @Transactional(readOnly = true)
    public ThreadDto get() {
        Membership me = messaging.callerMembership();
        return messaging.threadFor(me.getId()) instanceof MessageThread t
                ? new ThreadDto(t.getId(), render(t.getId()), t.getMemberLastReadAt())
                : new ThreadDto(null, List.of(), null);
    }

    @PostMapping("/messages")
    @Transactional
    public MessageDto send(@Valid @RequestBody SendRequest req) {
        Membership me = messaging.callerMembership();
        Message m = messaging.send(me.getId(), me.getId(), Message.MEMBER, req.body());
        return new MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                me.getUser().getName(), m.getCreatedAt());
    }

    @PostMapping("/read")
    @Transactional
    public void read() {
        messaging.markRead(messaging.callerMembership().getId(), false);
    }

    private List<MessageDto> render(UUID threadId) {
        return messages.findByThreadIdOrderByCreatedAtAsc(threadId).stream()
                .map(m -> new MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                        memberships.findById(m.getSenderMembershipId())
                                .map(x -> x.getUser().getName()).orElse(null),
                        m.getCreatedAt()))
                .toList();
    }
}
```

- [ ] **Step 3: Escalate for the `MIN_ROLE` registration**

The three new routes must be declared in `AuthzConformanceTest`'s `MIN_ROLE` or the build fails by design. **Do not edit that file.** Return to the orchestrator:

> Task 3 needs these registered in `MIN_ROLE`:
> `GET /api/box/me/thread` → `ATHLETE`
> `POST /api/box/me/thread/messages` → `ATHLETE`
> `POST /api/box/me/thread/read` → `ATHLETE`

- [ ] **Step 4: Write the four-test suite**

Create `backend/src/test/java/com/boxhub/messaging/MyThreadApiTest.java`. Four tests, per Global Constraints:

```java
package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MyThreadApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String aToken, bToken, foreignToken;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box box = newBox("Thr " + n, "thr-" + n);
        Box other = newBox("Oth " + n, "oth-" + n);

        User a = authService.register("ta-" + n + "@t.io", "correct-horse-battery", "Ada");
        User b = authService.register("tb-" + n + "@t.io", "correct-horse-battery", "Bo");
        User f = authService.register("tf-" + n + "@t.io", "correct-horse-battery", "Fern");
        aToken = tokenService.boxToken(a, member(a, box, "ATHLETE"));
        bToken = tokenService.boxToken(b, member(b, box, "ATHLETE"));
        foreignToken = tokenService.boxToken(f, member(f, other, "ATHLETE"));
    }

    /** HAPPY */
    @Test
    void memberSendsAndReadsBackTheirOwnThread() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aToken)
                        .content("{\"body\":\"Is the 6am on tomorrow?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderSide").value("MEMBER"));

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + aToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value("Is the 6am on tomorrow?"));
    }

    /** HAPPY — empty state is 200 with an empty list, never 204 (spec §6). */
    @Test
    void memberWithNoThreadGets200AndAnEmptyList() throws Exception {
        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + bToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(0));
    }

    /** AUTH-DENIED */
    @Test
    void anonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/me/thread")).andExpect(status().isUnauthorized());
    }

    /**
     * CROSS-MEMBER-DENIED — the guarantee @TenantId does not give us (spec §4).
     * Negative control: drop the membershipId predicate in MessageThreadRepository and this fails.
     */
    @Test
    void memberBNeverSeesMemberAsMessages() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + aToken)
                .content("{\"body\":\"ADA-PRIVATE-MARKER\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + bToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(0))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("ADA-PRIVATE-MARKER"))));
    }

    /** CROSS-TENANT-DENIED */
    @Test
    void anotherBoxSeesNothingOfThisBox() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + aToken)
                .content("{\"body\":\"ADA-PRIVATE-MARKER\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + foreignToken))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("ADA-PRIVATE-MARKER"))));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private Membership member(User u, Box box, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        return memberships.save(m);
    }
}
```

- [ ] **Step 5: Run**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  mvn -q test -Dtest=MyThreadApiTest
```

Expected: 5 tests, 0 failures.

- [ ] **Step 6: Commit**

```sh
cd ~/dev/boxhub && git add \
  backend/src/main/java/com/boxhub/messaging/MessagingService.java \
  backend/src/main/java/com/boxhub/messaging/MyThreadController.java \
  backend/src/test/java/com/boxhub/messaging/MyThreadApiTest.java && \
git commit -m "feat(m29a): member thread API, id-less and member-scoped"
```

---

## Task 4: Staff shared inbox API

**Files:**
- Create: `backend/src/main/java/com/boxhub/messaging/StaffInboxController.java`
- Test: `backend/src/test/java/com/boxhub/messaging/StaffInboxApiTest.java`

**Interfaces:**
- Consumes: `MessagingService.send/markRead/threadFor`, `MessageThread.needsReply()`.
- Produces: `StaffInboxController.InboxRow(UUID membershipId, String memberName, String lastMessagePreview, Instant lastMessageAt, boolean needsReply)`

- [ ] **Step 1: Write the controller**

```java
package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The staff shared inbox (D-1, D-3). Addressed by membershipId rather than thread id so opening a
 * NEW conversation needs no separate create call — the thread is created lazily on first send.
 *
 * Every method calls RoleGuard.requireStaff(). That is not politeness: SecurityConfig:87 gates
 * /api/box/** at SCOPE_box alone, so this call IS the access control. AuthzConformanceTest probe
 * (c) fires an ATHLETE token at every route declared stricter than ATHLETE and requires 403, so a
 * forgotten guard here is a BUILD FAILURE, not a latent hole.
 */
@RestController
@RequestMapping("/api/box/threads")
public class StaffInboxController {

    private final MessagingService messaging;
    private final MessageThreadRepository threads;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public StaffInboxController(MessagingService messaging, MessageThreadRepository threads,
                                MessageRepository messages, MembershipRepository memberships) {
        this.messaging = messaging;
        this.threads = threads;
        this.messages = messages;
        this.memberships = memberships;
    }

    public record InboxRow(UUID membershipId, String memberName, String lastMessagePreview,
                           Instant lastMessageAt, boolean needsReply) {}
    record SendRequest(@NotBlank @Size(max = 4000) String body) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<InboxRow> inbox() {
        RoleGuard.requireStaff();
        return threads.findAllByOrderByLastMessageAtDesc().stream()
                .map(t -> new InboxRow(
                        t.getMembershipId(),
                        memberships.findById(t.getMembershipId())
                                .map(m -> m.getUser().getName()).orElse(null),
                        preview(t.getId()),
                        t.getLastMessageAt(),
                        t.needsReply()))
                .toList();
    }

    @GetMapping("/{membershipId}")
    @Transactional(readOnly = true)
    public MyThreadController.ThreadDto thread(@PathVariable UUID membershipId) {
        RoleGuard.requireStaff();
        MessageThread t = messaging.threadFor(requireMemberOfThisBox(membershipId).getId());
        List<MyThreadController.MessageDto> rendered =
                messages.findByThreadIdOrderByCreatedAtAsc(t.getId()).stream()
                        .map(m -> new MyThreadController.MessageDto(m.getId(), m.getBody(),
                                m.getSenderSide(),
                                memberships.findById(m.getSenderMembershipId())
                                        .map(x -> x.getUser().getName()).orElse(null),
                                m.getCreatedAt()))
                        .toList();
        return new MyThreadController.ThreadDto(t.getId(), rendered, t.getStaffLastReadAt());
    }

    @PostMapping("/{membershipId}/messages")
    @Transactional
    public MyThreadController.MessageDto send(@PathVariable UUID membershipId,
                                              @Valid @RequestBody SendRequest req) {
        RoleGuard.requireStaff();
        Membership target = requireMemberOfThisBox(membershipId);
        Membership me = messaging.callerMembership();
        Message m = messaging.send(target.getId(), me.getId(), Message.STAFF, req.body());
        return new MyThreadController.MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                me.getUser().getName(), m.getCreatedAt());
    }

    @PostMapping("/{membershipId}/read")
    @Transactional
    public void read(@PathVariable UUID membershipId) {
        RoleGuard.requireStaff();
        // ONE shared marker (D-3): this clears the thread for the whole staff, by design.
        messaging.markRead(requireMemberOfThisBox(membershipId).getId(), true);
    }

    /**
     * Membership is NOT @TenantId, so it is not box-filtered for us — an id from another box would
     * otherwise resolve. Check the box explicitly. Never trust an id from a request param.
     */
    private Membership requireMemberOfThisBox(UUID membershipId) {
        return memberships.findById(membershipId)
                .filter(m -> m.getBox().getId().equals(com.boxhub.shared.TenantContext.requireBoxId()))
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }

    private String preview(UUID threadId) {
        List<Message> all = messages.findByThreadIdOrderByCreatedAtAsc(threadId);
        if (all.isEmpty()) return null;
        String body = all.getLast().getBody();
        return body.length() <= 120 ? body : body.substring(0, 120);
    }
}
```

- [ ] **Step 2: Escalate for `MIN_ROLE`**

> Task 4 needs registered, all `COACH`:
> `GET /api/box/threads`, `GET /api/box/threads/{membershipId}`,
> `POST /api/box/threads/{membershipId}/messages`, `POST /api/box/threads/{membershipId}/read`

- [ ] **Step 3: Write the tests**

Create `backend/src/test/java/com/boxhub/messaging/StaffInboxApiTest.java`. Reuse the `newBox`/`member` helpers from `MyThreadApiTest` (copy them in — do not extract a shared base; these fixtures differ). Required tests:

```java
    /** HAPPY: both directions, coach included. */
    @Test
    void coachRepliesAndTheMemberSeesIt() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteToken)
                .content("{\"body\":\"Is the 6am on?\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/threads").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].needsReply").value(true))
                .andExpect(jsonPath("$[0].lastMessagePreview").value("Is the 6am on?"));

        mvc.perform(post("/api/box/threads/" + athleteMembership.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Yes, see you there.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderSide").value("STAFF"));

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$.messages.length()").value(2));
    }

    /** D-3: one shared marker. Coach A reading clears it for Admin B. */
    @Test
    void readingClearsTheThreadForTheWholeStaff() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteToken)
                .content("{\"body\":\"hi\"}")).andExpect(status().isOk());

        mvc.perform(post("/api/box/threads/" + athleteMembership.getId() + "/read")
                .header("Authorization", "Bearer " + coachToken)).andExpect(status().isOk());

        mvc.perform(get("/api/box/threads").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$[0].needsReply").value(false));
    }

    /** AUTH-DENIED: an athlete may not reach the staff inbox at all. */
    @Test
    void athleteCannotReachTheStaffInbox() throws Exception {
        mvc.perform(get("/api/box/threads").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /**
     * CROSS-MEMBER-DENIED, the athlete-shaped attack: an athlete who KNOWS another member's
     * membershipId still cannot read their thread, because this route is staff-only.
     * Negative control: remove RoleGuard.requireStaff() from `thread` and this goes red —
     * and so does AuthzConformanceTest probe (c).
     */
    @Test
    void athleteWithAKnownMembershipIdIsStillForbidden() throws Exception {
        mvc.perform(get("/api/box/threads/" + otherAthleteMembership.getId())
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /** CROSS-TENANT-DENIED: a foreign box's admin cannot address our member. */
    @Test
    void foreignBoxAdminCannotOpenOurMembersThread() throws Exception {
        mvc.perform(get("/api/box/threads/" + athleteMembership.getId())
                        .header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isForbidden());
    }

    /** Staff sending first creates the thread — no separate create call. */
    @Test
    void staffCanOpenAConversationWithAMemberWhoNeverWrote() throws Exception {
        mvc.perform(post("/api/box/threads/" + athleteMembership.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Your plan lapses Friday.\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].senderSide").value("STAFF"));
    }
```

Fixture needs: `athleteToken`/`athleteMembership`, a second athlete (`otherAthleteMembership`), `coachToken`, `adminToken` in box A, and `foreignAdminToken` in box B.

- [ ] **Step 4: Run**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  mvn -q test -Dtest=StaffInboxApiTest
```

- [ ] **Step 5: Commit**

```sh
cd ~/dev/boxhub && git add \
  backend/src/main/java/com/boxhub/messaging/StaffInboxController.java \
  backend/src/test/java/com/boxhub/messaging/StaffInboxApiTest.java && \
git commit -m "feat(m29a): staff shared inbox, one read marker for the team"
```

---

## Task 5: Segments and the announcement API

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/SegmentResolver.java`, `AnnouncementService.java`, `MyAnnouncementsController.java`
- Modify: `backend/src/main/java/com/boxhub/box/AnnouncementController.java` (rewritten), `MemberController.java` (constant promoted)
- Test: `backend/src/test/java/com/boxhub/box/AnnouncementSegmentTest.java`

**Interfaces:**
- Consumes: Task 2's `AnnouncementRecipient*`.
- Produces:
  - `SegmentResolver.resolve(String segment, UUID segmentRef) -> List<UUID>` (membership ids)
  - `AnnouncementService.send(String body, String segment, UUID segmentRef) -> Announcement`
  - `AnnouncementController.AnnouncementRow(UUID id, String body, String segment, Instant sentAt, long sentCount, long readCount)`

- [ ] **Step 1: Promote `EXPIRING_SOON_DAYS`**

In `backend/src/main/java/com/boxhub/box/MemberController.java`, change line 28 from
`static final int EXPIRING_SOON_DAYS = 14;` to reference a shared constant, and create it in `SegmentResolver`:

```java
// MemberController.java — keep the name working for existing callers.
static final int EXPIRING_SOON_DAYS = SegmentResolver.EXPIRING_SOON_DAYS;
```

**Do NOT touch `HomeController`'s inline `planDaysLeft <= 7`.** That is the athlete's own banner, a different question for a different reader, deliberately left alone (spec §5) and filed in `docs/BACKLOG.md`.

- [ ] **Step 2: Write `SegmentResolver`**

```java
package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** The three segments, in one place. Resolution runs ONCE, at send (D-2). */
@Service
public class SegmentResolver {

    /**
     * 14, matching the staff members list. The segment is a STAFF-facing audience, so it must select
     * the same people staff already see flagged "expiring soon" there.
     * HomeController's athlete-facing 7-day banner is a different question and stays at 7.
     */
    public static final int EXPIRING_SOON_DAYS = 14;

    private static final Set<String> ROSTER_STATUSES = Set.of("BOOKED", "CHECKED_IN", "WAITLIST");

    private final MembershipRepository memberships;
    private final BookingRepository bookings;
    private final SubscriptionService subscriptions;

    public SegmentResolver(MembershipRepository memberships, BookingRepository bookings,
                           SubscriptionService subscriptions) {
        this.memberships = memberships;
        this.bookings = bookings;
        this.subscriptions = subscriptions;
    }

    public List<UUID> resolve(String segment, UUID segmentRef) {
        return switch (segment) {
            case Announcement.EVERYONE -> activeMemberIds();
            case Announcement.CLASS_ROSTER -> roster(segmentRef);
            case Announcement.EXPIRING -> expiring();
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UNKNOWN_SEGMENT");
        };
    }

    /**
     * Membership is NOT @TenantId, so this MUST be box-scoped explicitly. memberships.findAll() is a
     * standing banned grep for exactly this reason (M39 D-3 counted every membership on the platform).
     */
    private List<UUID> activeMemberIds() {
        return memberships.findByBoxId(TenantContext.requireBoxId()).stream()
                .filter(m -> "ACTIVE".equals(m.getStatus()))
                .map(Membership::getId)
                .toList();
    }

    /** D-7: waitlisted members are included — a cancellation is exactly what they need to hear. */
    private List<UUID> roster(UUID sessionId) {
        if (sessionId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SEGMENT_REF_REQUIRED");
        return bookings.findBySessionId(sessionId).stream()
                .filter(b -> ROSTER_STATUSES.contains(b.getStatus()))
                .map(Booking::getMembershipId)
                .distinct()
                .toList();
    }

    /** A grandfathered subscription (null currentPeriodEnd) never counts as expiring. */
    private List<UUID> expiring() {
        Instant cutoff = Instant.now().plus(EXPIRING_SOON_DAYS, ChronoUnit.DAYS);
        return activeMemberIds().stream()
                .filter(id -> subscriptions.activeFor(id)
                        .map(Subscription::getCurrentPeriodEnd)
                        .filter(end -> end != null && end.isBefore(cutoff))
                        .isPresent())
                .toList();
    }
}
```

**Signatures verified against `main` at plan time — use them as written, do not invent finders:**
`MembershipRepository.findByBoxId(UUID) -> List<Membership>` (`MembershipRepository.java:38`),
`Booking.getMembershipId()` / `Booking.getStatus()` (`Booking.java:32,36`), and
**`activeFor` is on `SubscriptionService`, NOT `SubscriptionRepository`** (`SubscriptionService.java:173`)
— inject the service, as the code above does. If any of these has moved, escalate rather than adding a duplicate.

- [ ] **Step 3: Write `AnnouncementService`**

```java
package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Sending = resolve the audience, then freeze it as rows. One transaction (D-2). */
@Service
public class AnnouncementService {

    private final AnnouncementRepository announcements;
    private final AnnouncementRecipientRepository recipients;
    private final SegmentResolver segments;

    public AnnouncementService(AnnouncementRepository announcements,
                               AnnouncementRecipientRepository recipients,
                               SegmentResolver segments) {
        this.announcements = announcements;
        this.recipients = recipients;
        this.segments = segments;
    }

    @Transactional
    public Announcement send(String body, String segment, UUID segmentRef) {
        Announcement a = new Announcement();
        a.setBody(body.trim());
        a.setSegment(segment);
        a.setSegmentRef(segmentRef);
        a.setSentBy(TenantContext.userId());
        a.setSentAt(Instant.now());
        announcements.save(a);

        // Frozen here and never recomputed: a member who renews tomorrow keeps this message.
        List<UUID> audience = segments.resolve(segment, segmentRef);
        for (UUID membershipId : audience) {
            AnnouncementRecipient r = new AnnouncementRecipient();
            r.setAnnouncementId(a.getId());
            r.setMembershipId(membershipId);
            recipients.save(r);
        }
        return a;
    }
}
```

- [ ] **Step 4: Rewrite `AnnouncementController`**

Replace the whole file. `PUT`/`DELETE`/`GET` on `/api/box/announcement` (singular) are gone.

```java
package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Staff surface: send an announcement to a segment, and read the history (D-4, D-8). */
@RestController
@RequestMapping("/api/box/announcements")
public class AnnouncementController {

    private final AnnouncementService service;
    private final AnnouncementRepository announcements;
    private final AnnouncementRecipientRepository recipients;

    public AnnouncementController(AnnouncementService service, AnnouncementRepository announcements,
                                  AnnouncementRecipientRepository recipients) {
        this.service = service;
        this.announcements = announcements;
        this.recipients = recipients;
    }

    public record AnnouncementRow(UUID id, String body, String segment, Instant sentAt,
                                  long sentCount, long readCount) {}
    record SendRequest(@NotBlank @Size(max = 2000) String body, @NotBlank String segment, UUID segmentRef) {}

    /** Coaches may send, not just admins (D-8): a coach cancelling their class needs no admin. */
    @PostMapping
    @Transactional
    public AnnouncementRow send(@Valid @RequestBody SendRequest req) {
        RoleGuard.requireStaff();
        Announcement a = service.send(req.body(), req.segment(), req.segmentRef());
        return row(a);
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<AnnouncementRow> history() {
        RoleGuard.requireStaff();
        return announcements.findAllByOrderBySentAtDesc().stream().map(this::row).toList();
    }

    private AnnouncementRow row(Announcement a) {
        return new AnnouncementRow(a.getId(), a.getBody(), a.getSegment(), a.getSentAt(),
                recipients.countByAnnouncementId(a.getId()),
                recipients.countByAnnouncementIdAndReadAtIsNotNull(a.getId()));
    }
}
```

- [ ] **Step 5: Write `MyAnnouncementsController`**

```java
package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** The member's own announcements. Member-scoped throughout (spec §4). */
@RestController
@RequestMapping("/api/box/me/announcements")
public class MyAnnouncementsController {

    private final AnnouncementRecipientRepository recipients;
    private final AnnouncementRepository announcements;
    private final MembershipRepository memberships;

    public MyAnnouncementsController(AnnouncementRecipientRepository recipients,
                                     AnnouncementRepository announcements,
                                     MembershipRepository memberships) {
        this.recipients = recipients;
        this.announcements = announcements;
        this.memberships = memberships;
    }

    public record MyAnnouncement(UUID id, String body, Instant sentAt, boolean read) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<MyAnnouncement> mine() {
        UUID me = me().getId();
        return recipients.findMineRaw(me).stream()
                .map(r -> announcements.findById(r.getAnnouncementId())
                        .map(a -> new MyAnnouncement(a.getId(), a.getBody(), a.getSentAt(), r.getReadAt() != null))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(MyAnnouncement::sentAt).reversed())
                .toList();
    }

    /**
     * {id} is an ANNOUNCEMENT id, resolved against MY membership. A member passing an announcement
     * they were not sent gets 404 — never someone else's recipient row.
     */
    @PostMapping("/{id}/read")
    @Transactional
    public void read(@PathVariable UUID id) {
        AnnouncementRecipient r = recipients.findByMembershipIdAndAnnouncementId(me().getId(), id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        r.setReadAt(Instant.now());
        recipients.save(r);
    }

    private Membership me() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "Not a member of this box"));
    }
}
```

- [ ] **Step 6: Escalate for `MIN_ROLE`**

> Task 5 needs registered:
> `POST /api/box/announcements` → `COACH`; `GET /api/box/announcements` → `COACH`
> `GET /api/box/me/announcements` → `ATHLETE`; `POST /api/box/me/announcements/{id}/read` → `ATHLETE`
> REMOVED, delete their entries: `GET`, `PUT`, `DELETE /api/box/announcement`

- [ ] **Step 7: Write the tests**

`backend/src/test/java/com/boxhub/box/AnnouncementSegmentTest.java` must cover:

```java
    /** D-2, THE decision. Negative control: resolve at read time and this goes red. */
    @Test
    void audienceIsFrozenAtSendSoARenewalDoesNotUnsendIt() throws Exception {
        // athlete's plan expires in 5 days -> matches EXPIRING
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + adminToken)
                .content("{\"body\":\"Renew before Friday\",\"segment\":\"EXPIRING\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentCount").value(1));

        renewAthleteForAnotherYear();   // no longer expiring

        mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].body").value("Renew before Friday"));
    }

    /** D-7 */
    @Test
    void classRosterIncludesWaitlistAndExcludesCancelled() throws Exception { /* book, waitlist, cancel three members */ }

    /** D-4 */
    @Test
    void twoSendsLeaveTwoRowsInHistory() throws Exception { /* send twice, GET /api/box/announcements length 2 */ }

    /** D-8 */
    @Test
    void aCoachMaySend() throws Exception { /* coachToken -> 200 */ }

    /** AUTH-DENIED */
    @Test
    void anAthleteMayNotSend() throws Exception { /* athleteToken -> 403 */ }

    /** CROSS-MEMBER-DENIED */
    @Test
    void memberCannotMarkAnotherMembersAnnouncementRead() throws Exception {
        // send to EVERYONE, then B posts /read for an announcement id A received.
        // B IS a recipient here, so use a CLASS_ROSTER send that includes A only:
        // B must get 404, and A's read state must stay false.
    }

    /** CROSS-TENANT-DENIED */
    @Test
    void foreignBoxSeesNoneOfOurAnnouncements() throws Exception { /* marker string absent */ }
```

Write every one out in full — the skeletons above name the assertion, not the code.

- [ ] **Step 8: Run**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  mvn -q test -Dtest=AnnouncementSegmentTest
```

- [ ] **Step 9: Commit**

```sh
cd ~/dev/boxhub && git add backend/src/main/java/com/boxhub/box/ \
  backend/src/test/java/com/boxhub/box/AnnouncementSegmentTest.java && \
git commit -m "feat(m29a): segments, frozen audiences, announcement history"
```

---

## Task 6: Re-source athlete home, retire the old endpoints, sweep the gates

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/HomeController.java`, `frontend/src/app/features/athlete/home.service.ts`
- Test: `backend/src/test/java/com/boxhub/box/HomeSurfaceApiTest.java` (existing — extend)

**Interfaces:**
- Consumes: `AnnouncementRecipientRepository.findLatestBodyForMember`.
- Produces: `HomeDto.announcement` unchanged in SHAPE (`{body, updatedAt}`), changed in SOURCE.

- [ ] **Step 1: Re-source the home card**

In `HomeController.home()`, replace:

```java
AnnouncementView ann = announcements.findAll().stream().findFirst()
        .map(a -> new AnnouncementView(a.getBody(), a.getUpdatedAt())).orElse(null);
```

with:

```java
// M29a (D-4): the latest announcement ADDRESSED TO ME, not "the box's one row". Members outside
// a segment correctly see nothing. The DTO shape is unchanged, so the screen does not move.
AnnouncementView ann = recipients
        .findLatestBodyForMember(me.getId(), org.springframework.data.domain.PageRequest.of(0, 1))
        .stream().findFirst()
        .map(a -> new AnnouncementView(a.getBody(), a.getSentAt()))
        .orElse(null);
```

Add `AnnouncementRecipientRepository recipients` to the constructor; remove the now-unused `AnnouncementRepository` field if nothing else uses it.

- [ ] **Step 2: Delete the two dead frontend methods**

In `frontend/src/app/features/athlete/home.service.ts`, delete lines 31-32 (`announcement()` and `putAnnouncement()`) and the now-unused `Announcement` export if nothing imports it. **Verify first:**

```sh
grep -rn "putAnnouncement\|homeSvc.announcement\|HomeService['\"]\?.*announcement" ~/dev/boxhub/frontend/src
```

Expected: no call sites. **If there ARE call sites, STOP and escalate** — the spec's retirement claim was checked and would be wrong.

- [ ] **Step 3: Extend the home test**

Add to `HomeSurfaceApiTest`:

```java
@Test
void homeShowsOnlyAnAnnouncementAddressedToMe() throws Exception {
    // Send to a CLASS_ROSTER that contains athleteA and not athleteB.
    mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteAToken))
            .andExpect(jsonPath("$.announcement.body").value("Roster only"));
    mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteBToken))
            .andExpect(jsonPath("$.announcement").doesNotExist());
}
```

- [ ] **Step 4: Run the FULL backend gate**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test
```

Expected: all green, count ≥ 567 + the new tests. **Never pipe this for its exit status** — in zsh `$?` after a pipe is the pipe's.

- [ ] **Step 5: Run all four standing greps**

```sh
cd ~/dev/boxhub
grep -rn "memberships\.findAll()" backend/src/main/java
grep -rn "MembershipEvent.LEFT" backend/src/main/java
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'
grep -rn "messageThreads\.findAll()\|messages\.findAll()\|announcementRecipients\.findAll()" backend/src/main/java
```

All four must print nothing.

- [ ] **Step 6: Commit**

```sh
cd ~/dev/boxhub && git add \
  backend/src/main/java/com/boxhub/box/HomeController.java \
  backend/src/test/java/com/boxhub/box/HomeSurfaceApiTest.java \
  frontend/src/app/features/athlete/home.service.ts && \
git commit -m "feat(m29a): home reads announcements addressed to the member; retire the old endpoints"
```

---

## Task 7: Frontend messaging service and models

**Files:**
- Create: `frontend/src/app/features/messaging/messaging.models.ts`, `messaging.service.ts`
- Test: `frontend/src/app/features/messaging/messaging.service.spec.ts`

**Interfaces:**
- Produces (every later frontend task consumes these exact names):

```ts
export interface ChatMessage { id: string; body: string; senderSide: 'MEMBER' | 'STAFF'; senderName: string | null; createdAt: string; }
export interface Thread { id: string | null; messages: ChatMessage[]; memberLastReadAt: string | null; }
export interface InboxRow { membershipId: string; memberName: string | null; lastMessagePreview: string | null; lastMessageAt: string | null; needsReply: boolean; }
export interface MyAnnouncement { id: string; body: string; sentAt: string; read: boolean; }
export interface AnnouncementRow { id: string; body: string; segment: Segment; sentAt: string; sentCount: number; readCount: number; }
export type Segment = 'EVERYONE' | 'CLASS_ROSTER' | 'EXPIRING';
```

- [ ] **Step 1: Write the service**

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Thread, ChatMessage, InboxRow, MyAnnouncement, AnnouncementRow, Segment } from './messaging.models';

@Injectable({ providedIn: 'root' })
export class MessagingService {
  private http = inject(HttpClient);

  // member
  myThread(): Observable<Thread> { return this.http.get<Thread>('/api/box/me/thread'); }
  sendAsMember(body: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>('/api/box/me/thread/messages', { body });
  }
  markMyThreadRead(): Observable<void> { return this.http.post<void>('/api/box/me/thread/read', {}); }
  myAnnouncements(): Observable<MyAnnouncement[]> {
    return this.http.get<MyAnnouncement[]>('/api/box/me/announcements');
  }
  markAnnouncementRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/box/me/announcements/${id}/read`, {});
  }

  // staff
  inbox(): Observable<InboxRow[]> { return this.http.get<InboxRow[]>('/api/box/threads'); }
  thread(membershipId: string): Observable<Thread> {
    return this.http.get<Thread>(`/api/box/threads/${membershipId}`);
  }
  sendAsStaff(membershipId: string, body: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`/api/box/threads/${membershipId}/messages`, { body });
  }
  markThreadRead(membershipId: string): Observable<void> {
    return this.http.post<void>(`/api/box/threads/${membershipId}/read`, {});
  }
  announcements(): Observable<AnnouncementRow[]> {
    return this.http.get<AnnouncementRow[]>('/api/box/announcements');
  }
  sendAnnouncement(body: string, segment: Segment, segmentRef?: string): Observable<AnnouncementRow> {
    return this.http.post<AnnouncementRow>('/api/box/announcements', { body, segment, segmentRef: segmentRef ?? null });
  }
}
```

- [ ] **Step 2: Spec it with `provideHttpClientTesting`**

Assert each method hits the exact URL and verb above. One `it` per method.

- [ ] **Step 3: Run Karma**

```sh
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

- [ ] **Step 4: Commit**

```sh
cd ~/dev/boxhub && git add frontend/src/app/features/messaging/ && \
git commit -m "feat(m29a): frontend messaging service"
```

---

## Task 8: Athlete Messages screen + header envelope

**Files:**
- Create: `frontend/src/app/features/messaging/athlete-messages.page.ts` (+ `.spec.ts`)
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/features/athlete/athlete-shell.page.ts`

**Interfaces:**
- Consumes: Task 7's `MessagingService`, `Thread`, `MyAnnouncement`.
- Produces: route `/athlete/messages`, component `AthleteMessagesPage`.

**Screen contract — every item is a gate, not a suggestion:**

| Concern | Requirement |
|---|---|
| Route | `{ path: 'messages', title: $localize`:@@route.athlete.messages:Messages`, loadComponent: … }` inside the `athlete` children |
| Entry | Envelope link in `athlete-shell.page.ts`'s header `actions` slot, `data-testid="athlete-messages-link"`, with an unread count. **Dock stays at five tabs** (D-6) |
| States | `loading` / `error` / `empty` / `ready` via a `state()` signal and `@switch`, matching `home.page.ts` |
| testids | `messages-root`, `thread-empty`, `message-<id>`, `message-composer`, `announcements-section`, `announcement-<id>` |
| Form | `<form (submit)="send($event)" novalidate>` + `event.preventDefault()`. NOT `(ngSubmit)`, NOT `FormsModule` |
| Guard | Empty/over-length body rejected **in the handler**, not by `[disabled]` alone |
| Polling | `setInterval` 20s started on init, cleared in `ngOnDestroy` AND when `document.visibilityState !== 'visible'` (D-5) |
| Type | Message bodies Archivo (prose). Timestamps and the unread count mono + tabular |
| Volt | **None.** Unread count uses `--bone` and weight |
| i18n | Every string `$localize` with a stable `@@` id |

- [ ] **Step 1: Build the component to the contract above**
- [ ] **Step 2: Write the Karma spec** — one `it` per state (loading, error, empty, ready), one for "send calls the service with the typed body", one for "polling stops when hidden".
- [ ] **Step 3: Karma green**

```sh
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
```

- [ ] **Step 4: Production build green** (`ng build` does not compile specs; Karma above is what caught those)

```sh
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

- [ ] **Step 5: `audit` — score ≥16/20, browser connected.** If Claude in Chrome is unavailable, **STOP AND ASK.** Do not score source-only.
- [ ] **Step 6: `critique` — score ≥32/40, browser connected**
- [ ] **Step 7: Fix every P0 and P1**
- [ ] **Step 8: Re-score BOTH.** A score measured with a P0/P1 open is not the screen's score.
- [ ] **Step 9: Commit** (explicit paths only)

---

## Task 9: Staff Inbox screen

**Files:**
- Create: `frontend/src/app/features/messaging/staff-inbox.page.ts` (+ `.spec.ts`)
- Modify: `frontend/src/app/app.routes.ts`, `coach-shell.page.ts`, `admin-shell.page.ts`

**Interfaces:** consumes `MessagingService.inbox/thread/sendAsStaff/markThreadRead`.

**Screen contract:**

| Concern | Requirement |
|---|---|
| Routes | `/coach/inbox` (coach children) and `/admin/messages` (admin children) — **one component, two route entries** |
| Nav | Coach: a fifth dock tab `{ link: 'inbox', label: 'Inbox', icon: 'mail' }` (coach has four, room for one). Admin: a `{ link: 'messages', label: 'Messages' }` entry in `nav` and `moreLinks` |
| List | Member name, last-message preview, relative time, and a needs-reply mark driven by `row.needsReply` — **never recomputed in the component** |
| Detail | Selecting a row loads `thread(membershipId)` and immediately calls `markThreadRead(membershipId)` |
| States | loading / error / empty / ready, plus an empty detail pane before selection |
| testids | `inbox-root`, `inbox-row-<membershipId>`, `inbox-needs-reply-<membershipId>`, `inbox-empty`, `thread-pane`, `message-composer` |
| Form | Native `(submit)` + `preventDefault()`, guard in the handler |
| Volt | **None** |
| i18n | All strings marked |

- [ ] **Step 1: Build to contract**
- [ ] **Step 2: Karma spec** — needs-reply mark renders from the flag; selecting a row marks it read; empty state.
- [ ] **Step 3: Karma green** (command as Task 8 Step 3)
- [ ] **Step 4: Production build green** (command as Task 8 Step 4)
- [ ] **Step 5: `audit` ≥16/20, browser connected**
- [ ] **Step 6: `critique` ≥32/40, browser connected**
- [ ] **Step 7: Fix every P0/P1**
- [ ] **Step 8: Re-score BOTH**
- [ ] **Step 9: Commit**

---

## Task 10: Announcements screen

**Files:**
- Create: `frontend/src/app/features/messaging/announcements.page.ts` (+ `.spec.ts`)
- Modify: `frontend/src/app/app.routes.ts`, `coach-shell.page.ts`, `admin-shell.page.ts`

**Interfaces:** consumes `MessagingService.announcements/sendAnnouncement`.

**Screen contract:**

| Concern | Requirement |
|---|---|
| Routes | `/coach/announcements` and `/admin/announcements` — one component, two entries (D-8) |
| Composer | Body textarea + segment `bh-select` (Everyone / A class / Expiring members). Choosing "A class" reveals a session picker that sets `segmentRef`; the other two must send `segmentRef: null` |
| History | Newest first, each row showing segment, sent time, and **`readCount` of `sentCount`** — mono, tabular |
| Confirm | Sending is irreversible and fans out to real people. **Confirm before sending**, naming the recipient count |
| States | loading / error / empty / ready; composer shows pending + inline error with input preserved |
| testids | `announcements-root`, `announcement-composer`, `announcement-segment`, `announcement-session-picker`, `announcement-send`, `announcement-row-<id>` |
| Form | Native `(submit)` + `preventDefault()`; `bh-select` binds `[(value)]` against a signal — it is NOT a `ControlValueAccessor` |
| Volt | **None** |
| i18n | All strings marked; dates locale-formatted |

- [ ] **Step 1: Build to contract**
- [ ] **Step 2: Karma spec** — segment switch shows/hides the session picker; `segmentRef` is null for EVERYONE and EXPIRING; send is blocked on an empty body from the handler.
- [ ] **Step 3: Karma green**
- [ ] **Step 4: Production build green**
- [ ] **Step 5: `audit` ≥16/20** · **Step 6: `critique` ≥32/40** · **Step 7: fix P0/P1** · **Step 8: re-score BOTH**
- [ ] **Step 9: Commit**

---

## Task 11: e2e round-trip and the full gate sweep

**Files:**
- Create: `e2e/tests/messaging.spec.ts`
- Test: the whole suite

- [ ] **Step 1: Write the round-trip spec**

One test, the whole product claim: member sends → staff inbox shows needs-reply → staff replies → member sees it. Plus one segmented announcement reaching its roster and not reaching a non-member of it.

`retries: 0` stays. **Do not add retries** — `playwright.config.ts` records why.

- [ ] **Step 2: Rebuild the frontend image, then run e2e on a clean stack**

```sh
cd ~/dev/boxhub/docker && docker compose down -v && docker compose up -d --build
```

Then run the e2e suite. **A screen is not verified until e2e runs on it.**

- [ ] **Step 3: If `programming`, `tracking` or `runner` fail, CHECK THE CLOCK FIRST**

`DevDataSeeder.todaySession()` is time-of-day dependent: seeding before 00:20 or after 23:20 local puts a class on the wrong local day. That is a known, filed seeder bug — not your diff.

- [ ] **Step 4: If `runner.spec.ts` "TV shows the clock" reds, read the WARN log**

`TvStreamService.push()` now logs at WARN when it drops a connection. That is the OPEN M37 lost-push bug, not yours. **Do not add retries. Do not touch the TV subsystem.** Report it.

- [ ] **Step 5: Visual suite on a clean stack**

```sh
cd ~/dev/boxhub && e2e/visual.sh
```

Runs in a Linux container — never Playwright locally, or you compare against baselines your renderer never wrote. A verify run immediately after `--update-snapshots` always passes and proves nothing.

- [ ] **Step 6: Full gate sweep — record every number, none inherited**

```sh
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
```

Plus the eight §8.1 greps, the four standing greps from Global Constraints, and `git diff origin/main -- backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java` showing **only `MIN_ROLE` entries**.

- [ ] **Step 7: Commit and update the backlog**

Add the deferred items from spec §10 to `docs/BACKLOG.md`, one line each.

---

## Self-Review

**Spec coverage:** §1 scope → Tasks 3,4,5. §2 D-1→T3/T4, D-2→T5, D-3→T4, D-4→T5/T6, D-5→T8/T9, D-6→T8, D-7→T5, D-8→T5/T10. §3 data model → T1/T2. §4 tenancy → T2 (scoped finders), T3/T4/T5 (four-test suites), T6 (greps). §5 segments → T5. §6 API → T3/T4/T5, retirements T6. §7 migration → T1. §8 screens → T8/T9/T10. §9 testing → every task + T11. §10 backlog → T11 Step 7. §11 TV bug → T11 Step 4. **No gaps.**

**Placeholder scan:** Task 5 Step 7 and Tasks 8–10 name assertions and contracts rather than full source. That is deliberate and marked: the segment tests say "write every one out in full", and the screen contracts are complete specifications (routes, testids, states, form idiom, type, i18n) whose *styling* is produced by the impeccable routine — itself a required gate with numeric thresholds, not a polish step. Writing speculative SCSS here would be fake precision.

**Type consistency:** `ThreadDto`/`MessageDto` are declared once in `MyThreadController` and reused by `StaffInboxController` (T4) — checked. Frontend `Thread`/`ChatMessage`/`InboxRow`/`MyAnnouncement`/`AnnouncementRow`/`Segment` declared once in T7 and consumed unchanged by T8/T9/T10 — checked. `SegmentResolver.EXPIRING_SOON_DAYS` is the single constant, referenced by `MemberController` (T5 Step 1) — checked.

**Signature check — done at plan time, not deferred to an executor.** All three external signatures the plan leans on were verified by hand against `main`:
`MembershipRepository.findByBoxId(UUID) -> List<Membership>` exists (`MembershipRepository.java:38`);
`Booking.getMembershipId()` and `Booking.getStatus()` exist (`Booking.java:32,36`);
and **`activeFor(UUID)` is on `SubscriptionService`, not `SubscriptionRepository`** (`SubscriptionService.java:173`) — the first draft of `SegmentResolver` injected the repository and would not have compiled. Corrected in Task 5 Step 2.
