# M29b Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give rxed an event system and an in-app notification feed, so that the fourteen things the product should tell people are actually told — starting with the waitlist promotion that has been silent since it was written.

**Architecture:** One `notification` table with one row per recipient, written **inside** the transaction that caused it. A Java enum, `NotificationType`, is the single declaration of every event's icon, link, dedupe rule, default state and whether it shows in the feed. `NEW_ANNOUNCEMENT` rows delegate their read state to `announcement_recipient.read_at` rather than owning a second one. A bell in the shell header beside the existing messages envelope opens a routed, day-grouped feed; preferences live on their own page, keyed by type **and** channel so M27c can add push without a migration.

**Tech Stack:** Spring Boot 3.5 / Java 21, Postgres 16 + Flyway, Hibernate 6 (`@TenantId`, `@JdbcTypeCode(SqlTypes.JSON)`), Angular 22 (standalone, signals), Karma, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-m29b-notifications-design.md` — read it before Task 1. The plan argues from the spec; where they disagree, the spec wins and the plan is wrong.

## Global Constraints

Every task's requirements implicitly include this section.

- **Build backend with** `cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. **There is no `./mvnw`.** The system JDK is 26 and too new.
- **`NODE_OPTIONS` is poisoned.** Every frontend and Playwright command runs under `env -u NODE_OPTIONS`, including the impeccable plugin's own scripts.
- **Never pipe a gate and read `$?`.** Redirect to a file, `echo $?`, then grep the file. A piped gate has already reported a false zero in this project.
- **Playwright runs from `e2e/`**, never the repo root — there is no root `package.json`, so `npx playwright` from the root resolves the wrong binary. Use `cd e2e && env -u NODE_OPTIONS node_modules/.bin/playwright test …`.
- **Compose commands run from the repo root:** `docker compose -f docker/docker-compose.yml …`. App at `http://localhost/app/`.
- **Schema changes only via Flyway.** Never edit an applied migration. The next free version is `V32`.
- **Tenancy:** resolve the tenant ONLY from the JWT via `TenantContext`. A tenant-less read fails CLOSED and returns empty. `runAsRoot` is for platform jobs only and **must never be on a thread that inserts a `@TenantId` row**. `grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'` must return nothing.
- **Every box-scoped endpoint gets three tests:** happy, auth-denied, cross-tenant-denied.
- **`AuthzConformanceTest` is orchestrator-only.** An executor never edits it. Registering a route is the only permitted edit; never weaken an assertion, never allowlist around one.
- **Tokens only.** No hardcoded colour, font, radius or spacing anywhere outside `frontend/src/styles/_tokens.scss`. A raw hex is a bug.
- **Dark only.** No light theme, no `data-theme`, no `prefers-color-scheme`.
- **Volt is spent.** The box switcher's mark is the shell's one volt element, so nothing added here may use `--volt` except the `bh-switch` knob, which already does. Badges are `--bone` on `--surface-2`.
- **i18n is binding.** Every user-facing string is `$localize`d or carries an `i18n` attribute with an explicit `@@id`. **A placeholder name must follow its expression immediately** — `${n}:count:` — or it ships as literal text past both Karma and the production build. No new hardcoded string, no new hand-written `€`.
- **Mobile first, 360px.** Nothing scrolls horizontally at 320px. A primary action is full-width and tall. No native `<select>` for anything richer than a short plain label.
- **`(ngSubmit)` dies with `FormsModule`.** A form binds the native `(submit)="submit($event)"` with `novalidate` and calls `event.preventDefault()`.
- **`frontend/src/app/ui/` is signal-inputs only** — `input()`, `model()`, `output()`. No `@Input()`, no `@Output()`, no raw px type sizes, no raw hex.
- **An attribute on a component host does not reach the element inside it.** A component needing a `data-testid` on an inner node takes an explicit input and binds it there.
- **A disabled button guards one path, never the action.** Put the guard in the handler too, and move focus onto whatever replaced the control.
- **Conventional commits.** End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm
  ```

## File Structure

New backend package `com.boxhub.notify` — mirrors `com.boxhub.messaging`, and keeps the event model out of `box`, which every emitter already imports.

| File | Responsibility |
|---|---|
| `backend/src/main/resources/db/migration/V32__notifications.sql` | Both tables, both indexes, `boxes.class_reminder_minutes` |
| `notify/Notification.java` | The row. `@TenantId`, `params` as `jsonb` |
| `notify/NotificationPref.java` | One override of one type on one channel |
| `notify/NotificationType.java` | **The catalogue.** Icon, feed visibility, default, mandatory, link, dedupe key, source id |
| `notify/NotificationChannel.java` | `IN_APP` today; `PUSH`, `SMS` reserved |
| `notify/NotificationRepository.java`, `notify/NotificationPrefRepository.java` | Queries |
| `notify/NotificationService.java` | `emit` / `emitAll`, preference resolution, dedupe. `Propagation.MANDATORY` |
| `notify/NotificationController.java` | Feed list, unread count, read, read-all |
| `notify/NotificationPrefController.java` | Preference read/write |
| `notify/SubscriptionExpiringJob.java`, `notify/ClassReminderScheduler.java` | The two new sweeps |
| `frontend/src/app/features/notifications/*` | Service, models, copy map, bell, feed page, prefs page |

Emitter edits are in place, in the file that already owns the state change: `BookingService`, `SessionController`, `AnnouncementService`, `MemberController`, `StripeWebhookController`, `InvitePublicController`, `BoxSignupService`, the `PostLike` insert site, `BookingMaintenance`, `PurgeJob`.

---

## Task 1: Reconcile the 7-day banner with `EXPIRING_SOON_DAYS`

Ships first and alone. Until this lands, `SUBSCRIPTION_EXPIRING` cannot be written without the badge and the banner contradicting each other on screen. Spec §11, D-12.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/HomeController.java:110`
- Test: `backend/src/test/java/com/boxhub/box/` — whichever suite asserts the boundary (find it in Step 1)
- Modify: `frontend/src/app/features/athlete/home.page.spec.ts` if it asserts 7

**Interfaces:**
- Consumes: `SegmentResolver.EXPIRING_SOON_DAYS` (public static final int = 14), already imported by `MemberController`
- Produces: nothing new. This task only deletes a literal.

- [ ] **Step 1: Find every dependent before touching the line**

`docs/PREFLIGHT.md`'s most-repeated failure is editing the files a change *is* rather than the files that *depend on it*. Run all four and read the output:

```bash
cd ~/dev/boxhub
grep -rn "planExpiringSoon\|planDaysLeft" backend/src frontend/src
grep -rn "expiringSoon\|expiring" backend/src/test/java/com/boxhub/box | grep -i "7\|seven"
grep -rn "expiring" frontend/src/app/features/athlete/home.page.spec.ts
grep -rn "plusDays(7)\|<= 7\|daysLeft" backend/src/test e2e/tests
```

- [ ] **Step 2: Write the failing test**

A membership expiring in **10 days** — inside 14, outside 7 — must now report `planExpiringSoon = true`. Add to the existing `HomeController` test class found in Step 1 (create `HomeExpiryTest` in `backend/src/test/java/com/boxhub/box/` only if none exists), following that class's own fixture style:

```java
@Test
void aMembershipExpiringInTenDaysIsExpiringSoon() {
    // 10 days out: was false under the 7-day literal, must be true under EXPIRING_SOON_DAYS (14)
    seedActiveSubscriptionEndingIn(Duration.ofDays(10));

    var home = homeController.home();

    assertThat(home.planExpiringSoon()).isTrue();
}

@Test
void aMembershipExpiringInTwentyDaysIsNotExpiringSoon() {
    seedActiveSubscriptionEndingIn(Duration.ofDays(20));

    assertThat(homeController.home().planExpiringSoon()).isFalse();
}
```

- [ ] **Step 3: Run it and watch the first test fail**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='*Home*' > /tmp/m29b-t1.txt 2>&1; echo $?
grep -n "aMembershipExpiringInTenDays\|Tests run" /tmp/m29b-t1.txt
```

Expected: `aMembershipExpiringInTenDaysIsExpiringSoon` FAILS (`expected true but was false`), the 20-day one passes. **If the 10-day test passes already, stop and report** — the literal is not where the plan says it is.

- [ ] **Step 4: Delete the literal**

In `HomeController.java`, add the import and replace line 110:

```java
import static com.boxhub.box.SegmentResolver.EXPIRING_SOON_DAYS;
```

```java
// One number, everywhere a person is told about expiry: this banner, the staff "expiring"
// announcement segment, the members-table chip and SUBSCRIPTION_EXPIRING. A banner that
// disagreed with a badge about who is expiring is worse than either (M29b D-12).
boolean expiring = planDaysLeft != null && planDaysLeft >= 0 && planDaysLeft <= EXPIRING_SOON_DAYS;
```

- [ ] **Step 5: Fix every dependent found in Step 1**

Update each assertion that encoded 7. **Do not weaken one to `>= 0`** — an assertion that passes for any number would stay green under the exact bug it exists to catch.

- [ ] **Step 6: Run the full backend suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t1-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t1-full.txt | tail -5
```

Expected: `BUILD SUCCESS`, zero failures and zero errors.

- [ ] **Step 7: Run Karma if `home.page.spec.ts` changed**

```bash
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless > /tmp/m29b-t1-karma.txt 2>&1; echo $?
tail -5 /tmp/m29b-t1-karma.txt
```

- [ ] **Step 8: Commit**

```bash
cd ~/dev/boxhub
git add -A
git commit -m "fix(m29b): one expiry number — the athlete banner joins EXPIRING_SOON_DAYS

HomeController hardcoded 7 days while SegmentResolver.EXPIRING_SOON_DAYS is
14, so the athlete banner and the staff-facing 'expiring' segment answered
different questions about the same person. SUBSCRIPTION_EXPIRING fires on the
14-day rule, so shipping it first would have put a badge on screen next to a
banner that disagreed with it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 2: The migration and the two entities

**Files:**
- Create: `backend/src/main/resources/db/migration/V32__notifications.sql`
- Create: `backend/src/main/java/com/boxhub/notify/Notification.java`
- Create: `backend/src/main/java/com/boxhub/notify/NotificationPref.java`
- Create: `backend/src/main/java/com/boxhub/notify/NotificationChannel.java`
- Create: `backend/src/main/java/com/boxhub/notify/NotificationRepository.java`
- Create: `backend/src/main/java/com/boxhub/notify/NotificationPrefRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/Box.java` — add `classReminderMinutes`
- Test: `backend/src/test/java/com/boxhub/notify/NotificationEntityTest.java`

**Interfaces:**
- Produces: `Notification` (getters/setters for `id, boxId, membershipId, type, params, link, sourceId, dedupeKey, createdAt, readAt`), `NotificationPref` (`membershipId, type, channel, enabled`), `NotificationChannel.IN_APP`, and the two repositories. Tasks 3–4 consume all of them.

- [ ] **Step 1: Write the migration**

`backend/src/main/resources/db/migration/V32__notifications.sql`:

```sql
-- M29b. One row per recipient per event; the audience is frozen at emit (registry §5.2).
create table notification (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    membership_id uuid not null references memberships(id),
    type          text not null,
    -- Frozen at emit and rendered client-side per type, so strings stay i18n-marked and a class
    -- deleted next week still renders its notification. Never a rendered sentence.
    params        jsonb not null default '{}'::jsonb,
    -- An app ROUTE path, never a URL: M27c resolves a push tap through the same router.
    link          text,
    -- The announcement id for NEW_ANNOUNCEMENT, whose read state lives in announcement_recipient.
    source_id     uuid,
    dedupe_key    text,
    created_at    timestamptz not null default now(),
    -- Always null for NEW_ANNOUNCEMENT: that type delegates (M29b D-3). There is exactly one
    -- read marker per announcement and it is announcement_recipient.read_at.
    read_at       timestamptz
);

create index notification_feed_idx on notification (box_id, membership_id, created_at desc);

-- The guarantee behind SUBSCRIPTION_EXPIRING not firing fourteen nights running, and behind a
-- restarted ClassReminderScheduler not double-firing. The jobs also check before inserting; this
-- index is the safety net, not the control flow.
create unique index notification_dedupe_idx
    on notification (box_id, membership_id, type, dedupe_key)
    where dedupe_key is not null;

-- Sparse: a row exists ONLY where a member overrode the type's default. Absent means "the enum's
-- default", which is what stops a new event from needing a backfill of every member x every type.
create table notification_pref (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    membership_id uuid not null references memberships(id),
    type          text not null,
    -- 'IN_APP' only in M29b. The column exists now so M27c can add 'PUSH' without a migration
    -- and without rebuilding the preferences UI (M29b D-6).
    channel       text not null,
    enabled       boolean not null,
    unique (box_id, membership_id, type, channel)
);

-- Per-box lead time for CLASS_STARTING_SOON.
alter table boxes add column class_reminder_minutes int not null default 60;
```

- [ ] **Step 2: Write the entities**

`Notification.java` — note `@JdbcTypeCode(SqlTypes.JSON)` with `columnDefinition = "jsonb"`, copying `Wod.java`'s mapping exactly. `V10__class_timers_spec_text.sql` records why: Hibernate will not cast a plain `String` bind param to `jsonb`, so the field must be a `Map`, never a JSON `String`.

```java
package com.boxhub.notify;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.TenantId;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** One notification, addressed to one membership. Written INSIDE the causing transaction (D-4). */
@Entity
@Table(name = "notification")
public class Notification {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private String type;

    /** Map, never a JSON String — Hibernate will not cast a String bind param to jsonb (see V10). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> params = new HashMap<>();

    @Column private String link;
    @Column(name = "source_id") private UUID sourceId;
    @Column(name = "dedupe_key") private String dedupeKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    /** Stays null forever for NEW_ANNOUNCEMENT: that type delegates to announcement_recipient (D-3). */
    @Column(name = "read_at") private Instant readAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
    public Map<String, Object> getParams() { return params; }
    public void setParams(Map<String, Object> v) { this.params = v; }
    public String getLink() { return link; }
    public void setLink(String v) { this.link = v; }
    public UUID getSourceId() { return sourceId; }
    public void setSourceId(UUID v) { this.sourceId = v; }
    public String getDedupeKey() { return dedupeKey; }
    public void setDedupeKey(String v) { this.dedupeKey = v; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant v) { this.readAt = v; }
}
```

`NotificationPref.java`:

```java
package com.boxhub.notify;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.util.UUID;

/** One member's override of one type on one channel. Absent means "the type's default" (D-8). */
@Entity
@Table(name = "notification_pref")
public class NotificationPref {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private String type;
    @Column(nullable = false) private String channel;
    @Column(nullable = false) private boolean enabled;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
    public String getChannel() { return channel; }
    public void setChannel(String v) { this.channel = v; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean v) { this.enabled = v; }
}
```

`NotificationChannel.java`:

```java
package com.boxhub.notify;

/** IN_APP is the only channel M29b delivers. PUSH is M27c's, SMS is M32b's (registry §2). */
public enum NotificationChannel {
    IN_APP, PUSH, SMS
}
```

- [ ] **Step 3: Write the repositories**

```java
package com.boxhub.notify;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /**
     * Page one of the feed. Keyset, not offset: an emit between two page fetches would shift an
     * offset window and silently skip a row. `types` is the showsInFeed set, passed by the caller
     * so the enum stays the single declaration of what the feed shows.
     */
    @Query("""
           select n from Notification n
            where n.membershipId = :mid and n.type in :types
            order by n.createdAt desc, n.id desc
           """)
    List<Notification> firstPage(@Param("mid") UUID membershipId,
                                 @Param("types") List<String> types, Pageable page);

    /** Later pages. The id tiebreak matters: emitAll writes many rows at one Instant. */
    @Query("""
           select n from Notification n
            where n.membershipId = :mid and n.type in :types
              and (n.createdAt < :ts or (n.createdAt = :ts and n.id < :id))
            order by n.createdAt desc, n.id desc
           """)
    List<Notification> pageAfter(@Param("mid") UUID membershipId, @Param("types") List<String> types,
                                 @Param("ts") Instant cursorCreatedAt, @Param("id") UUID cursorId,
                                 Pageable page);

    /**
     * Half of the bell's count. NEW_ANNOUNCEMENT is excluded here and counted from
     * announcement_recipient instead — one marker, two readers (D-3).
     */
    @Query("""
           select count(n) from Notification n
            where n.membershipId = :mid and n.type in :types and n.readAt is null
           """)
    long countUnread(@Param("mid") UUID membershipId, @Param("types") List<String> types);

    /** The dedupe check. The partial unique index is the guarantee; this is the control flow. */
    boolean existsByMembershipIdAndTypeAndDedupeKey(UUID membershipId, String type, String dedupeKey);

    /** Member-scoped: a member marking one read can only ever reach their OWN row. */
    Optional<Notification> findByIdAndMembershipId(UUID id, UUID membershipId);

    List<Notification> findByMembershipIdAndTypeInAndReadAtIsNull(UUID membershipId, List<String> types);

    /** Retention (spec §8). Deliberately tenant-agnostic: called by PurgeJob under runAsRoot. */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "delete from notification where created_at < :cutoff", nativeQuery = true)
    int purge(@Param("cutoff") Instant cutoff);
}
```

```java
package com.boxhub.notify;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationPrefRepository extends JpaRepository<NotificationPref, UUID> {

    Optional<NotificationPref> findByMembershipIdAndTypeAndChannel(UUID membershipId, String type, String channel);

    /** The fan-out path. One query for twenty recipients, never one lookup per recipient. */
    List<NotificationPref> findByMembershipIdInAndTypeAndChannel(Collection<UUID> membershipIds,
                                                                String type, String channel);

    List<NotificationPref> findByMembershipId(UUID membershipId);
}
```

- [ ] **Step 4: Add the Box column**

In `backend/src/main/java/com/boxhub/box/Box.java`, beside `bookingHorizonWeeks`:

```java
/** Lead time for CLASS_STARTING_SOON, in minutes before startAt. Per box (registry §4.1). */
@Column(name = "class_reminder_minutes", nullable = false) private int classReminderMinutes = 60;
```

and its accessors:

```java
public int getClassReminderMinutes() { return classReminderMinutes; }
public void setClassReminderMinutes(int v) { this.classReminderMinutes = v; }
```

- [ ] **Step 5: Write the entity test**

`backend/src/test/java/com/boxhub/notify/NotificationEntityTest.java`. This exists to prove two things that fail loudly and confusingly if wrong: the `jsonb` round-trip, and that `@TenantId` populates `box_id` on insert.

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationEntityTest extends AbstractIntegrationTest {

    @Autowired NotificationRepository notifications;

    @Test
    void paramsRoundTripThroughJsonb() {
        UUID sessionId = UUID.randomUUID();
        Notification n = new Notification();
        n.setMembershipId(seedMembershipId());
        n.setType(NotificationType.WAITLIST_PROMOTED.name());
        n.setParams(Map.of("sessionId", sessionId.toString(), "className", "6:00 WOD"));
        notifications.saveAndFlush(n);

        Notification found = notifications.findById(n.getId()).orElseThrow();

        assertThat(found.getParams()).containsEntry("className", "6:00 WOD");
        assertThat(found.getParams()).containsEntry("sessionId", sessionId.toString());
    }

    @Test
    void tenantIdPopulatesBoxIdOnInsert() {
        Notification n = new Notification();
        n.setMembershipId(seedMembershipId());
        n.setType(NotificationType.WAITLIST_PROMOTED.name());
        notifications.saveAndFlush(n);

        // Not merely non-null: it must be THIS box, or the row is invisible to its own reader.
        assertThat(notifications.findById(n.getId()).orElseThrow().getBoxId()).isEqualTo(currentBoxId());
    }
}
```

Use `AbstractIntegrationTest`'s existing helpers for the seeded membership and box id — read that class and match its naming rather than inventing `seedMembershipId()`/`currentBoxId()` if it already names them differently.

**This test references `NotificationType`, which Task 3 creates.** Write Task 3's enum first if you are executing tasks strictly in order and the compile fails; the two tasks share one commit boundary if that is simpler.

- [ ] **Step 6: Run it**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NotificationEntityTest' > /tmp/m29b-t2.txt 2>&1; echo $?
grep -E "Tests run|ERROR" /tmp/m29b-t2.txt | head -20
```

Expected: 2 tests, 0 failures. A failure mentioning `column "params" is of type jsonb but expression is of type character varying` means the field was typed as `String`; it must be a `Map`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/resources/db/migration/V32__notifications.sql backend/src/main/java/com/boxhub/notify backend/src/main/java/com/boxhub/box/Box.java backend/src/test/java/com/boxhub/notify
git commit -m "feat(m29b): notification and notification_pref tables

One row per recipient per event. read_at stays null forever for
NEW_ANNOUNCEMENT, which delegates to announcement_recipient.read_at — there is
exactly one read marker per announcement.

notification_pref is keyed by type AND channel, writing only IN_APP rows
today, so M27c adds push without a migration or a preferences rebuild.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 3: `NotificationType` — the catalogue

The single declaration of every event. Nothing else in the codebase may decide an event's icon, link, default or feed visibility. Spec §5.

**Files:**
- Create: `backend/src/main/java/com/boxhub/notify/NotificationType.java`
- Test: `backend/src/test/java/com/boxhub/notify/NotificationTypeTest.java`

**Interfaces:**
- Produces: `NotificationType` with `icon()`, `showsInFeed()`, `defaultOn()`, `mandatory()`, `link(Map)`, `dedupeKey(Map)`, `sourceId(Map)`, `feedTypeNames()`, and the param-key constants. Tasks 4–16 and the frontend copy map all consume it.

- [ ] **Step 1: Write the enum**

```java
package com.boxhub.notify;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Every event the product fires. This enum IS the registry's §4 table in code — icon, feed
 * visibility, default state and policy are declared here and nowhere else, which is why there is
 * no DB check constraint on notification.type: adding an event is a row in docs/NOTIFICATIONS.md
 * plus a constant here, never a migration (M29b D-5).
 *
 * <p><b>Links are static per type, not per recipient.</b> Athlete-facing types link into
 * /athlete/**, which roleGuard admits ATHLETE, COACH and BOX_ADMIN to — so a coach who booked a
 * class follows the same link an athlete does, with no role lookup at emit time. The two
 * staff-facing types link into /admin/**, and both are addressed to box admins only.
 */
public enum NotificationType {
    //                        icon               feed   default  mandatory
    WAITLIST_PROMOTED       ("check",            true,  true,    false),
    CLASS_CANCELLED         ("x",                true,  true,    false),
    CLASS_TIME_CHANGED      ("calendar",         true,  true,    false),
    COACH_CHANGED           ("user",             true,  true,    false),
    LATE_CANCEL_UNREFUNDED  ("triangle-alert",   true,  true,    false),
    NO_SHOW_RECORDED        ("circle-alert",     true,  true,    false),
    NEW_ANNOUNCEMENT        ("mail",             true,  true,    false),
    SUBSCRIPTION_EXPIRING   ("credit-card",      true,  true,    true),
    PAYMENT_FAILED          ("triangle-alert",   true,  true,    true),
    MEMBERSHIP_BLOCKED      ("lock",             true,  true,    true),
    INVITE_ACCEPTED         ("user",             true,  true,    false),
    NEW_MEMBER_JOINED       ("users",            true,  true,    false),

    /**
     * Scheduled by ClassReminderScheduler and shown by nobody until M27c gives it a transport. The
     * row is written so the sweep is assertable and dedupe works; showsInFeed=false keeps it out of
     * the feed, because an in-app "starts in 1 hour" read at 9pm is noise (M29b D-11).
     */
    CLASS_STARTING_SOON     ("calendar",         false, true,    false),

    /**
     * Declared so M27c has something to route push against. Emits NO row: bh-messages-envelope
     * already delivers this with its own badge and its own read marker, and a second copy in the
     * feed would mean two badges counting one message (M29b D-2).
     */
    NEW_MESSAGE             ("mail",             false, true,    false);

    // ---- param keys. Callers use these constants, never string literals. ----
    public static final String SESSION_ID = "sessionId";
    public static final String CLASS_NAME = "className";
    public static final String START_AT = "startAt";
    public static final String OLD_START_AT = "oldStartAt";
    public static final String NEW_START_AT = "newStartAt";
    public static final String COACH_NAME = "coachName";
    public static final String ANNOUNCEMENT_ID = "announcementId";
    public static final String BODY_PREVIEW = "bodyPreview";
    public static final String SENT_BY_NAME = "sentByName";
    public static final String SUBSCRIPTION_ID = "subscriptionId";
    public static final String PLAN_NAME = "planName";
    public static final String ENDS_AT = "endsAt";
    public static final String AMOUNT_CENTS = "amountCents";
    public static final String CURRENCY = "currency";
    public static final String INVITEE_NAME = "inviteeName";
    public static final String MEMBER_NAME = "memberName";

    /** Announcement bodies are user-written and arbitrarily long; the feed row shows a preview. */
    public static final int BODY_PREVIEW_CHARS = 140;

    private final String icon;
    private final boolean showsInFeed;
    private final boolean defaultOn;
    private final boolean mandatory;

    NotificationType(String icon, boolean showsInFeed, boolean defaultOn, boolean mandatory) {
        this.icon = icon;
        this.showsInFeed = showsInFeed;
        this.defaultOn = defaultOn;
        this.mandatory = mandatory;
    }

    public String icon() { return icon; }
    public boolean showsInFeed() { return showsInFeed; }
    public boolean defaultOn() { return defaultOn; }
    /** Money and account-security events have no toggle (registry §5.3). */
    public boolean mandatory() { return mandatory; }

    /** The types the feed query selects. Passed into the repository so this stays the one source. */
    public static List<String> feedTypeNames() {
        return Arrays.stream(values()).filter(NotificationType::showsInFeed).map(Enum::name).toList();
    }

    /** An app ROUTE path, never a URL — M27c resolves a push tap through the same router. */
    public String link(Map<String, Object> params) {
        return switch (this) {
            case WAITLIST_PROMOTED, CLASS_CANCELLED, CLASS_TIME_CHANGED, COACH_CHANGED,
                 LATE_CANCEL_UNREFUNDED, NO_SHOW_RECORDED, CLASS_STARTING_SOON ->
                    "/athlete/class/" + params.get(SESSION_ID);
            case SUBSCRIPTION_EXPIRING, PAYMENT_FAILED, MEMBERSHIP_BLOCKED -> "/athlete/membership";
            case INVITE_ACCEPTED, NEW_MEMBER_JOINED -> "/admin/members";
            // The feed opens an announcement in a sheet in place; there is no route to send it to.
            case NEW_ANNOUNCEMENT, NEW_MESSAGE -> null;
        };
    }

    /**
     * Non-null only where re-firing is a bug rather than a fact. A renewal legitimately re-arms
     * SUBSCRIPTION_EXPIRING because the period end is part of the key.
     */
    public String dedupeKey(Map<String, Object> params) {
        return switch (this) {
            case SUBSCRIPTION_EXPIRING -> params.get(SUBSCRIPTION_ID) + ":" + params.get(ENDS_AT);
            case CLASS_STARTING_SOON -> String.valueOf(params.get(SESSION_ID));
            default -> null;
        };
    }

    /** The announcement whose read marker this row delegates to (D-3). Null for every other type. */
    public UUID sourceId(Map<String, Object> params) {
        if (this != NEW_ANNOUNCEMENT) return null;
        Object raw = params.get(ANNOUNCEMENT_ID);
        return raw == null ? null : UUID.fromString(raw.toString());
    }
}
```

- [ ] **Step 2: Write the test**

These assertions exist because each one, if wrong, produces a silent defect rather than a crash: a dead link, a nightly duplicate, a row nobody can mark read.

```java
package com.boxhub.notify;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTypeTest {

    @Test
    void everyFeedTypeExceptAnnouncementsHasALink() {
        // A feed row with no link is a row that cannot be opened. NEW_ANNOUNCEMENT is the one
        // deliberate exception: it opens a sheet in place.
        for (NotificationType t : NotificationType.values()) {
            if (!t.showsInFeed() || t == NotificationType.NEW_ANNOUNCEMENT) continue;
            Map<String, Object> params = Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString());
            assertThat(t.link(params)).as("link for %s", t).isNotBlank();
        }
    }

    @Test
    void classLinksPointAtTheAthleteClassDetailRoute() {
        UUID sessionId = UUID.randomUUID();
        assertThat(NotificationType.WAITLIST_PROMOTED.link(Map.of(NotificationType.SESSION_ID, sessionId.toString())))
                .isEqualTo("/athlete/class/" + sessionId);
    }

    @Test
    void expiringDedupeKeyChangesWhenThePeriodEndChanges() {
        UUID sub = UUID.randomUUID();
        String first = NotificationType.SUBSCRIPTION_EXPIRING.dedupeKey(
                Map.of(NotificationType.SUBSCRIPTION_ID, sub.toString(), NotificationType.ENDS_AT, "2026-10-01"));
        String afterRenewal = NotificationType.SUBSCRIPTION_EXPIRING.dedupeKey(
                Map.of(NotificationType.SUBSCRIPTION_ID, sub.toString(), NotificationType.ENDS_AT, "2026-11-01"));

        // Same key would suppress the warning forever after one send; a renewal must re-arm it.
        assertThat(first).isNotEqualTo(afterRenewal);
    }

    @Test
    void onlyTwoTypesDedupe() {
        for (NotificationType t : NotificationType.values()) {
            String key = t.dedupeKey(Map.of(NotificationType.SESSION_ID, "s",
                    NotificationType.SUBSCRIPTION_ID, "x", NotificationType.ENDS_AT, "y"));
            boolean expected = t == NotificationType.SUBSCRIPTION_EXPIRING || t == NotificationType.CLASS_STARTING_SOON;
            assertThat(key != null).as("dedupes: %s", t).isEqualTo(expected);
        }
    }

    @Test
    void messagesAndRemindersAreNotInTheFeed() {
        assertThat(NotificationType.feedTypeNames())
                .doesNotContain(NotificationType.NEW_MESSAGE.name(), NotificationType.CLASS_STARTING_SOON.name())
                .hasSize(12);
    }

    @Test
    void mandatoryTypesAreExactlyTheMoneyAndAccessOnes() {
        assertThat(java.util.Arrays.stream(NotificationType.values())
                .filter(NotificationType::mandatory).map(Enum::name).toList())
                .containsExactlyInAnyOrder("SUBSCRIPTION_EXPIRING", "PAYMENT_FAILED", "MEMBERSHIP_BLOCKED");
    }

    @Test
    void everyDeclaredTypeIsOnByDefault() {
        // PR_CONGRATULATED, the one opt-in event, is deferred to M25 because nothing creates a
        // PostLike yet. defaultOn stays on the enum regardless: registry §5.3 requires every event
        // to declare a default, and M27c/M32b will add types that start off.
        assertThat(java.util.Arrays.stream(NotificationType.values())
                .filter(t -> !t.defaultOn()).toList()).isEmpty();
    }
}
```

- [ ] **Step 3: Run it**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NotificationTypeTest,NotificationEntityTest' > /tmp/m29b-t3.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t3.txt | head
```

Expected: 9 tests, 0 failures.

- [ ] **Step 4: Verify every icon name actually exists**

An icon name that is not in `ICON_NAMES` renders as nothing, silently. `bell` is added in Task 18; every other name here must already exist today.

```bash
cd ~/dev/boxhub
for i in check x calendar user triangle-alert circle-alert mail credit-card lock users; do
  grep -q "'$i'" frontend/src/app/ui/icon.component.ts || echo "MISSING: $i"
done
echo "icon check done"
```

Expected: only `icon check done`. Any `MISSING:` line is a blocker — **report it, do not substitute an icon**; the spec picked these deliberately.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/notify/NotificationType.java backend/src/test/java/com/boxhub/notify/NotificationTypeTest.java
git commit -m "feat(m29b): NotificationType, the event catalogue

Fourteen events; twelve write a feed row. NEW_MESSAGE is declared so M27c can
route push against it but emits nothing — the envelope already delivers it.
CLASS_STARTING_SOON writes a row that the feed excludes, so the scheduler is
assertable and deduped before push exists to deliver it.

Icon, link, default and dedupe rule are declared here and nowhere else, which
is why notification.type carries no DB check constraint: adding an event stays
a doc row plus a constant, not a migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 4: `NotificationService` — emit, preferences, dedupe

Where D-4 stops being a rule and becomes a compiler-and-runtime guarantee.

**Files:**
- Create: `backend/src/main/java/com/boxhub/notify/NotificationService.java`
- Test: `backend/src/test/java/com/boxhub/notify/NotificationServiceTest.java`
- Modify: `docs/NOTIFICATIONS.md` §5.1 (spec §3)

**Interfaces:**
- Consumes: `NotificationType`, `NotificationRepository`, `NotificationPrefRepository`, `NotificationChannel`
- Produces: `NotificationService.emit(NotificationType, UUID membershipId, Map<String,Object> params)` and `emitAll(NotificationType, Collection<UUID>, Map<String,Object>)`, both `void`, both `@Transactional(propagation = MANDATORY)`. Every emitter task calls these two methods and nothing else.

- [ ] **Step 1: Write the service**

```java
package com.boxhub.notify;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The only way a notification is created.
 *
 * <p><b>Propagation.MANDATORY is the point.</b> CLAUDE.md's rule is that mail fires strictly after
 * commit while an audit row is written strictly inside the transaction, and an in-app notification
 * is an audit row, not a mail: a rolled-back waitlist promotion must erase its own "you're in".
 * MANDATORY makes that structural — emitting outside a transaction throws
 * IllegalTransactionStateException at the call site instead of quietly writing a row that survives
 * a rollback. Do not relax it to REQUIRED "so the job works"; give the job a transaction.
 *
 * <p><b>Tenancy.</b> Notification is @TenantId, so box_id is populated from the ambient tenant on
 * insert. Every caller must therefore already be under a real box: a request thread has one from
 * the JWT, and a job or webhook must be inside TenantContext.runAsBox(boxId, ...) installed BEFORE
 * the transaction opened. Never emit under runAsRoot — the row would take the sentinel box_id and
 * be invisible to the person it was written for.
 */
@Service
public class NotificationService {

    private final NotificationRepository notifications;
    private final NotificationPrefRepository prefs;

    public NotificationService(NotificationRepository notifications, NotificationPrefRepository prefs) {
        this.notifications = notifications;
        this.prefs = prefs;
    }

    /** One recipient. Silently does nothing if the member has the type switched off (D-8). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void emit(NotificationType type, UUID membershipId, Map<String, Object> params) {
        emitAll(type, List.of(membershipId), params);
    }

    /**
     * Fan-out. The preference lookup is ONE query for the whole audience — a class cancellation
     * with twenty on the roster must not cost twenty preference reads (the N+1 shape this codebase
     * has shipped before, on GET /api/box/me/announcements).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void emitAll(NotificationType type, Collection<UUID> membershipIds, Map<String, Object> params) {
        if (membershipIds == null || membershipIds.isEmpty()) return;
        Map<String, Object> safeParams = params == null ? Map.of() : params;

        Set<UUID> recipients = enabledFor(type, membershipIds);
        if (recipients.isEmpty()) return;

        String dedupeKey = type.dedupeKey(safeParams);
        String link = type.link(safeParams);
        UUID sourceId = type.sourceId(safeParams);

        for (UUID membershipId : recipients) {
            if (dedupeKey != null
                    && notifications.existsByMembershipIdAndTypeAndDedupeKey(membershipId, type.name(), dedupeKey)) {
                continue;
            }
            Notification n = new Notification();
            n.setMembershipId(membershipId);
            n.setType(type.name());
            n.setParams(new HashMap<>(safeParams));
            n.setLink(link);
            n.setSourceId(sourceId);
            n.setDedupeKey(dedupeKey);
            notifications.save(n);
        }
    }

    /**
     * Who among these members has this type switched on. A mandatory type is on for everybody and
     * skips the query entirely; otherwise an absent pref row means the type's own default, which is
     * what keeps notification_pref sparse and free of backfills.
     */
    private Set<UUID> enabledFor(NotificationType type, Collection<UUID> membershipIds) {
        if (type.mandatory()) return Set.copyOf(membershipIds);

        Map<UUID, Boolean> overrides = prefs
                .findByMembershipIdInAndTypeAndChannel(membershipIds, type.name(), NotificationChannel.IN_APP.name())
                .stream()
                .collect(Collectors.toMap(NotificationPref::getMembershipId, NotificationPref::isEnabled, (a, b) -> a));

        return membershipIds.stream()
                .filter(id -> overrides.getOrDefault(id, type.defaultOn()))
                .collect(Collectors.toSet());
    }
}
```

- [ ] **Step 2: Write the tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationServiceTest extends AbstractIntegrationTest {

    @Autowired NotificationService service;
    @Autowired NotificationRepository notifications;
    @Autowired NotificationPrefRepository prefs;
    @Autowired PlatformTransactionManager txManager;

    private TransactionTemplate tx() { return new TransactionTemplate(txManager); }

    @Test
    void emittingOutsideATransactionThrowsRatherThanWritingARow() {
        // The whole of D-4 in one assertion: a notification cannot be created after commit,
        // because there is no way to call this without a transaction.
        assertThatThrownBy(() -> service.emit(NotificationType.WAITLIST_PROMOTED, seedMembershipId(), Map.of()))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aRolledBackTransactionLeavesNoNotification() {
        UUID member = seedMembershipId();
        try {
            tx().executeWithoutResult(status -> {
                service.emit(NotificationType.WAITLIST_PROMOTED, member,
                        Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString()));
                throw new IllegalStateException("boom — the cause failed after emitting");
            });
        } catch (IllegalStateException expected) {
            // the promotion did not happen, so the athlete must not be told it did
        }
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aDisabledTypeWritesNothing() {
        UUID member = seedMembershipId();
        tx().executeWithoutResult(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(member);
            off.setType(NotificationType.WAITLIST_PROMOTED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            prefs.save(off);
        });

        tx().executeWithoutResult(s -> service.emit(NotificationType.WAITLIST_PROMOTED, member,
                Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString())));

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aMandatoryTypeIgnoresAnOffSwitch() {
        UUID member = seedMembershipId();
        tx().executeWithoutResult(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(member);
            off.setType(NotificationType.PAYMENT_FAILED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            prefs.save(off);
        });

        tx().executeWithoutResult(s -> service.emit(NotificationType.PAYMENT_FAILED, member,
                Map.of(NotificationType.AMOUNT_CENTS, 4900)));

        // Money events are mandatory (registry §5.3): the switch must not exist, let alone work.
        assertThat(notifications.count()).isOne();
    }

    @Test
    void switchingATypeBackOnDoesNotBackfillPastEvents() {
        UUID member = seedMembershipId();
        UUID pref = tx().execute(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(member);
            off.setType(NotificationType.CLASS_CANCELLED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            return prefs.save(off).getId();
        });

        // fires while the member has it off — nothing is written
        tx().executeWithoutResult(s -> service.emit(NotificationType.CLASS_CANCELLED, member,
                Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString())));
        assertThat(notifications.count()).isZero();

        // they switch it back on
        tx().executeWithoutResult(s -> {
            NotificationPref on = prefs.findById(pref).orElseThrow();
            on.setEnabled(true);
            prefs.save(on);
        });

        // The preference is checked at emit, not at read (D-8): switching a type on shows future
        // events only. A read-time filter would resurrect rows never written for this member, and
        // "who was told?" would stop being answerable.
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aDedupedTypeFiresOnceForTheSameKey() {
        UUID member = seedMembershipId();
        UUID subscription = UUID.randomUUID();
        Map<String, Object> params = Map.of(
                NotificationType.SUBSCRIPTION_ID, subscription.toString(),
                NotificationType.ENDS_AT, "2026-10-01");

        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member, params));
        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member, params));

        // A nightly sweep runs this fourteen times; the member must be warned once.
        assertThat(notifications.count()).isOne();
    }

    @Test
    void aRenewalReArmsTheExpiryWarning() {
        UUID member = seedMembershipId();
        UUID subscription = UUID.randomUUID();

        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member,
                Map.of(NotificationType.SUBSCRIPTION_ID, subscription.toString(),
                       NotificationType.ENDS_AT, "2026-10-01")));
        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member,
                Map.of(NotificationType.SUBSCRIPTION_ID, subscription.toString(),
                       NotificationType.ENDS_AT, "2026-11-01")));

        assertThat(notifications.count()).isEqualTo(2);
    }

    @Test
    void announcementRowsCarryTheirSourceAndNoReadState() {
        UUID member = seedMembershipId();
        UUID announcementId = UUID.randomUUID();

        tx().executeWithoutResult(s -> service.emit(NotificationType.NEW_ANNOUNCEMENT, member,
                Map.of(NotificationType.ANNOUNCEMENT_ID, announcementId.toString(),
                       NotificationType.BODY_PREVIEW, "No 18:00 on Friday")));

        Notification row = notifications.findAll().getFirst();
        assertThat(row.getSourceId()).isEqualTo(announcementId);
        // read_at stays null forever for this type: announcement_recipient.read_at is the one
        // marker, and a value here would be a second read state disagreeing with it (D-3).
        assertThat(row.getReadAt()).isNull();
    }

    @Test
    void fanOutSkipsOnlyTheMembersWhoSwitchedItOff() {
        UUID keeps = seedMembershipId();
        UUID mutes = seedSecondMembershipId();
        tx().executeWithoutResult(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(mutes);
            off.setType(NotificationType.CLASS_CANCELLED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            prefs.save(off);
        });

        tx().executeWithoutResult(s -> service.emitAll(NotificationType.CLASS_CANCELLED, List.of(keeps, mutes),
                Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString())));

        assertThat(notifications.findAll()).singleElement()
                .extracting(Notification::getMembershipId).isEqualTo(keeps);
    }
}
```

Use `AbstractIntegrationTest`'s real helper names for the two seeded memberships; `seedMembershipId()` / `seedSecondMembershipId()` are placeholders for whatever that class already provides. **If it provides only one, add a second seeded ACTIVE membership in the same box** rather than reusing one id for both.

- [ ] **Step 3: Run them**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NotificationServiceTest' > /tmp/m29b-t4.txt 2>&1; echo $?
grep -E "Tests run|FAIL|ERROR" /tmp/m29b-t4.txt | head -20
```

Expected: 9 tests, 0 failures.

- [ ] **Step 4: Amend the registry's §5.1**

In `docs/NOTIFICATIONS.md`, replace the body of §5.1 with the text from the spec's §3 — the split between persistence and delivery. Keep the heading. This is committed here, with the code that relies on it, not batched to the end.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/notify/NotificationService.java backend/src/test/java/com/boxhub/notify/NotificationServiceTest.java docs/NOTIFICATIONS.md
git commit -m "feat(m29b): NotificationService, with the inside-tx rule made structural

Propagation.MANDATORY means emitting outside a transaction throws at the call
site rather than quietly writing a row that survives a rollback. A rolled-back
waitlist promotion now erases its own 'you're in', which is the whole reason
an in-app row is an audit row and not a mail.

Amends NOTIFICATIONS.md §5.1, which merged persistence and delivery into one
after-commit rule. An in-app row goes inside the transaction; a send — mail,
push, SMS — stays strictly after commit, because it cannot be retracted.

The fan-out resolves preferences in one query for the whole audience: a
cancellation with twenty on the roster is one preference read, not twenty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 5: Booking emitters — promotion, late cancel, no-show

Three events, all in `BookingService`, all already inside `@Transactional` methods. This task closes the gap the registry calls the sharpest in the product: `BookingService` promotes someone into a class and tells them nothing.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingService.java`
- Test: `backend/src/test/java/com/boxhub/notify/BookingNotificationTest.java`

**Interfaces:**
- Consumes: `NotificationService.emit(NotificationType, UUID, Map)`, `NotificationType.{SESSION_ID, CLASS_NAME, START_AT}`
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class BookingNotificationTest extends AbstractIntegrationTest {

    @Autowired NotificationRepository notifications;

    @Test
    void promotingOffTheWaitlistTellsThePromotedAthlete() {
        // Seed a full session, one booked member and one waitlisted; the booked member cancels.
        var seeded = seedFullSessionWithWaitlist();

        bookingService.cancel(seeded.bookedBookingId());

        var rows = notifications.findAll().stream()
                .filter(n -> NotificationType.WAITLIST_PROMOTED.name().equals(n.getType())).toList();
        assertThat(rows).singleElement()
                .satisfies(n -> {
                    assertThat(n.getMembershipId()).isEqualTo(seeded.waitlistedMembershipId());
                    assertThat(n.getParams()).containsEntry(NotificationType.CLASS_NAME, seeded.className());
                    assertThat(n.getLink()).isEqualTo("/athlete/class/" + seeded.sessionId());
                });
    }

    @Test
    void theCancellingMemberIsNotToldAboutTheirOwnCancellation() {
        var seeded = seedFullSessionWithWaitlist();

        bookingService.cancel(seeded.bookedBookingId());

        // No booking-confirmation-style receipts (D-13): only the promoted athlete hears anything.
        assertThat(notifications.findAll())
                .allSatisfy(n -> assertThat(n.getMembershipId()).isEqualTo(seeded.waitlistedMembershipId()));
    }

    @Test
    void anEmptyWaitlistNotifiesNobody() {
        var seeded = seedBookedSessionWithNoWaitlist();

        bookingService.cancel(seeded.bookedBookingId());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aLateCancelThatBurnedTheEntryTellsTheMember() {
        // Box configured so a late cancel does NOT refund the entry.
        var seeded = seedBookingCancellableLateWithoutRefund();

        bookingService.cancel(seeded.bookingId());

        assertThat(notifications.findAll()).singleElement()
                .satisfies(n -> {
                    assertThat(n.getType()).isEqualTo(NotificationType.LATE_CANCEL_UNREFUNDED.name());
                    assertThat(n.getMembershipId()).isEqualTo(seeded.membershipId());
                });
    }

    @Test
    void aLateCancelThatRefundedTheEntrySaysNothing() {
        // Same lateness, box refunds late cancellations: there is no consequence to report, so
        // this must stay silent rather than become a receipt for an action the member just took.
        var seeded = seedBookingCancellableLateWithRefund();

        bookingService.cancel(seeded.bookingId());

        assertThat(notifications.findAll())
                .noneSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.LATE_CANCEL_UNREFUNDED.name()));
    }

    @Test
    void markingSomeoneNoShowTellsThem() {
        var seeded = seedBookedSessionWithNoWaitlist();

        bookingService.markNoShow(seeded.bookedBookingId());

        assertThat(notifications.findAll()).singleElement()
                .extracting(Notification::getType).isEqualTo(NotificationType.NO_SHOW_RECORDED.name());
    }
}
```

The `seed*` helpers are yours to write in this test class using `AbstractIntegrationTest`'s existing fixture style — read a neighbouring booking test (`backend/src/test/java/com/boxhub/box/`, anything exercising `BookingService.cancel`) and copy its seeding rather than inventing a new one. Each returns a small record of the ids the assertion needs. **Do not** make lateness depend on the wall clock: seed `startAt` relative to `Instant.now()` explicitly, because a test whose precondition depends on the time of day is a broken test, not a caveat to document.

- [ ] **Step 2: Run and watch them fail**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='BookingNotificationTest' > /tmp/m29b-t5.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t5.txt | head
```

Expected: 6 tests, 5 failures (`anEmptyWaitlistNotifiesNobody` passes vacuously — it asserts zero rows and nothing emits yet). **A vacuous pass is not evidence.** It becomes meaningful only once the other five are green.

- [ ] **Step 3: Emit on promotion**

In `BookingService`, add the constructor dependency `NotificationService notifications` (constructor injection, matching the class's existing style), then inside `cancel(...)`, in the `if (wasBooked)` block, immediately after `bookings.save(promoted);`:

```java
// The gap NOTIFICATIONS.md called the sharpest in the product: before M29b this line gave
// someone a place in a class and told them nothing. Inside the transaction on purpose — a
// promotion that rolls back must not leave a "you're in" behind it (M29b D-4).
notifications.emit(NotificationType.WAITLIST_PROMOTED, promoted.getMembershipId(),
        Map.of(NotificationType.SESSION_ID, session.getId().toString(),
               NotificationType.CLASS_NAME, session.getName(),
               NotificationType.START_AT, session.getStartAt().toString()));
```

- [ ] **Step 4: Emit on a late cancel that cost an entry**

Still in `cancel(...)`, after the `refundEntry` decision and its ledger block:

```java
// Only when the lateness actually cost something. A plain "you cancelled" would be a receipt
// for an action the member just performed; this is a consequence they may not have noticed.
if (active != null && wasBooked && late && !refundEntry) {
    notifications.emit(NotificationType.LATE_CANCEL_UNREFUNDED, membershipId,
            Map.of(NotificationType.SESSION_ID, session.getId().toString(),
                   NotificationType.CLASS_NAME, session.getName(),
                   NotificationType.START_AT, session.getStartAt().toString()));
}
```

- [ ] **Step 5: Emit on a manual no-show**

In `markNoShow(...)` (the method setting `NO_SHOW` at roughly line 174), after the save. It needs the session for its params, so load it from the booking:

```java
ClassSession session = sessions.findById(b.getSessionId()).orElseThrow();
notifications.emit(NotificationType.NO_SHOW_RECORDED, b.getMembershipId(),
        Map.of(NotificationType.SESSION_ID, session.getId().toString(),
               NotificationType.CLASS_NAME, session.getName(),
               NotificationType.START_AT, session.getStartAt().toString()));
```

**Do not touch `sweepNoShows`.** It runs under `runAsRoot` and emitting there would write sentinel `box_id`s — Task 10 restructures it, and only then does it emit.

- [ ] **Step 6: Run the tests, then the whole suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='BookingNotificationTest' > /tmp/m29b-t5b.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t5b.txt | head
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t5-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t5-full.txt | tail -3
```

Expected: 6/6, then `BUILD SUCCESS`. Existing booking tests now run inside a transaction that also writes notifications — if one fails on a count assertion, read it before changing it.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/box/BookingService.java backend/src/test/java/com/boxhub/notify/BookingNotificationTest.java
git commit -m "feat(m29b): tell people about promotions, burned entries and no-shows

BookingService promoted the head of the waitlist into a freed spot and told
them nothing — the registry named this the sharpest gap in the product, and
it has been silent since the line was written.

Late cancellation notifies only when the entry was NOT refunded. A plain
'you cancelled' is a receipt for an action the member just took; an entry
they lost is a consequence they may not have noticed.

sweepNoShows is deliberately untouched: it runs under runAsRoot and emitting
there would write sentinel box_ids.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 6: Session emitters — cancelled, moved, coach swapped

`SessionController.patch` changes three things silently today. Waitlisted members are included, per M29a's D-7: *"tomorrow's 6am is cancelled" is precisely the message someone waiting for a spot needs.*

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/SessionController.java:91-104`
- Test: `backend/src/test/java/com/boxhub/notify/SessionNotificationTest.java`

**Interfaces:**
- Consumes: `NotificationService.emitAll`, `SegmentResolver.ROSTER_STATUSES` (the same status set announcements use, so the two surfaces cannot disagree about who is on a roster), `BookingRepository.findBySessionId`
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

class SessionNotificationTest extends AbstractIntegrationTest {

    @Autowired NotificationRepository notifications;

    @Test
    void cancellingAClassTellsTheRosterAndTheWaitlist() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), cancelRequest());

        assertThat(notifications.findAll())
                .hasSize(2)
                .allSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.CLASS_CANCELLED.name()))
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrder(seeded.bookedMembershipId(), seeded.waitlistedMembershipId());
    }

    @Test
    void movingAClassCarriesBothTimes() {
        var seeded = seedSessionWithBookedAndWaitlisted();
        Instant moved = seeded.startAt().plus(90, ChronoUnit.MINUTES);

        patchSession(seeded.sessionId(), startAtRequest(moved));

        assertThat(notifications.findAll()).allSatisfy(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.CLASS_TIME_CHANGED.name());
            // Both times: "moved to 07:30" is useless if you cannot tell which class moved.
            assertThat(n.getParams()).containsEntry(NotificationType.OLD_START_AT, seeded.startAt().toString());
            assertThat(n.getParams()).containsEntry(NotificationType.NEW_START_AT, moved.toString());
        });
    }

    @Test
    void patchingStartAtToTheSameInstantNotifiesNobody() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), startAtRequest(seeded.startAt()));

        // A no-op save must not fire. A PATCH that echoes the current value is routine.
        assertThat(notifications.count()).isZero();
    }

    @Test
    void swappingTheCoachTellsTheRoster() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), coachRequest(seedSecondCoachUserId()));

        assertThat(notifications.findAll()).hasSize(2).allSatisfy(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.COACH_CHANGED.name());
            assertThat(n.getParams()).containsKey(NotificationType.COACH_NAME);
        });
    }

    @Test
    void patchingCapacityAloneNotifiesNobody() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), capacityRequest(30));

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aCancelledMemberIsNotNotified() {
        // Someone who already dropped out is not on the roster and must not hear about it.
        var seeded = seedSessionWithBookedWaitlistedAndCancelled();

        patchSession(seeded.sessionId(), cancelRequest());

        assertThat(notifications.findAll())
                .extracting(Notification::getMembershipId)
                .doesNotContain(seeded.cancelledMembershipId());
    }
}
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='SessionNotificationTest' > /tmp/m29b-t6.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t6.txt | head
```

Expected: 6 tests, 3 failures (the three "notifies nobody" tests pass vacuously).

- [ ] **Step 3: Capture the old values before the setters run**

`patch` currently overwrites and then saves. Comparison has to happen first. Replace the mutation block with:

```java
// Captured BEFORE the setters: after them, "did this change?" is unanswerable, and a PATCH
// that echoes the current value is routine — it must not fire a notification.
Instant previousStartAt = s.getStartAt();
UUID previousCoachId = s.getCoachId();
String previousStatus = s.getStatus();

if (req.capacity() != null && req.capacity() > 0) s.setCapacity(req.capacity());
if (req.coachId() != null) s.setCoachId(req.coachId());
if (req.startAt() != null) s.setStartAt(req.startAt());
if ("CANCELLED".equals(req.status()) || "SCHEDULED".equals(req.status())) s.setStatus(req.status());
sessions.save(s);

boolean nowCancelled = "CANCELLED".equals(s.getStatus()) && !"CANCELLED".equals(previousStatus);
boolean timeMoved = !s.getStartAt().equals(previousStartAt);
boolean coachSwapped = s.getCoachId() != null && !s.getCoachId().equals(previousCoachId);

if (nowCancelled || timeMoved || coachSwapped) {
    notifyRoster(s, previousStartAt, nowCancelled, timeMoved, coachSwapped);
}
```

- [ ] **Step 4: Add the roster fan-out**

Below `patch`, in the same class:

```java
/**
 * The roster INCLUDING the waitlist (M29a D-7): "tomorrow's 6am is cancelled" is precisely the
 * message someone waiting for a spot needs. ROSTER_STATUSES is the same set announcements use,
 * so the two surfaces cannot disagree about who is on a roster, and distinct() matters because
 * one membership can hold two rows for one session.
 *
 * Cancellation wins when several things changed at once: a member whose class was cancelled does
 * not also need to be told its new coach.
 */
private void notifyRoster(ClassSession s, Instant previousStartAt,
                          boolean cancelled, boolean timeMoved, boolean coachSwapped) {
    List<UUID> roster = bookings.findBySessionId(s.getId()).stream()
            .filter(b -> SegmentResolver.ROSTER_STATUSES.contains(b.getStatus()))
            .map(Booking::getMembershipId)
            .distinct()
            .toList();
    if (roster.isEmpty()) return;

    Map<String, Object> base = new HashMap<>();
    base.put(NotificationType.SESSION_ID, s.getId().toString());
    base.put(NotificationType.CLASS_NAME, s.getName());
    base.put(NotificationType.START_AT, s.getStartAt().toString());

    if (cancelled) {
        notifications.emitAll(NotificationType.CLASS_CANCELLED, roster, base);
        return;
    }
    if (timeMoved) {
        Map<String, Object> moved = new HashMap<>(base);
        moved.put(NotificationType.OLD_START_AT, previousStartAt.toString());
        moved.put(NotificationType.NEW_START_AT, s.getStartAt().toString());
        notifications.emitAll(NotificationType.CLASS_TIME_CHANGED, roster, moved);
    }
    if (coachSwapped) {
        Map<String, Object> swapped = new HashMap<>(base);
        swapped.put(NotificationType.COACH_NAME, coachName(s.getCoachId()));
        notifications.emitAll(NotificationType.COACH_CHANGED, roster, swapped);
    }
}
```

`coachName(UUID)` already exists in `AnnouncementController`; `SessionController` resolves coach names inline. Use whatever that class already does rather than adding a second lookup — check its existing `users.findById(...).map(User::getName)` usage and extract it to a private method if it appears twice.

- [ ] **Step 5: Confirm `ROSTER_STATUSES` is reachable**

```bash
cd ~/dev/boxhub
grep -n "ROSTER_STATUSES" backend/src/main/java/com/boxhub/box/SegmentResolver.java
```

Expected: a `public static final` collection. If it is package-private, it is still reachable — `SessionController` is in the same package. **If it does not exist, stop and report**; do not hand-write a second status list, because a roster that disagrees with the announcement roster is a bug that shows up as "some people were told and some were not".

- [ ] **Step 6: Run the tests, then the whole suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='SessionNotificationTest' > /tmp/m29b-t6b.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t6b.txt | head
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t6-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t6-full.txt | tail -3
```

Expected: 6/6, then `BUILD SUCCESS`.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/box/SessionController.java backend/src/test/java/com/boxhub/notify/SessionNotificationTest.java
git commit -m "feat(m29b): a cancelled, moved or re-coached class tells its roster

SessionController.patch changed all three silently. The old values are now
captured before the setters run, so a PATCH echoing the current value stays
quiet — 'did this change?' is unanswerable afterwards.

Waitlisted members are included (M29a D-7): 'tomorrow's 6am is cancelled' is
precisely the message someone waiting for a spot needs. The roster uses
SegmentResolver.ROSTER_STATUSES, the same set announcements use, so the two
surfaces cannot disagree about who is on a roster.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 7: `NEW_ANNOUNCEMENT` — the delegating emitter

The one type whose read state lives somewhere else. Everything M29a left ready is consumed here and nothing about segments is re-decided: the audience is already frozen as rows, so the fan-out is a `SELECT` the service already has in hand.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/AnnouncementService.java`
- Test: `backend/src/test/java/com/boxhub/notify/AnnouncementNotificationTest.java`

**Interfaces:**
- Consumes: `NotificationService.emitAll`, `NotificationType.{ANNOUNCEMENT_ID, BODY_PREVIEW, SENT_BY_NAME, BODY_PREVIEW_CHARS}`, `UserRepository`
- Produces: `notification` rows carrying `source_id` = the announcement id. Task 13's list endpoint joins on it.

- [ ] **Step 1: Write the failing tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.AnnouncementService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class AnnouncementNotificationTest extends AbstractIntegrationTest {

    @Autowired AnnouncementService announcements;
    @Autowired NotificationRepository notifications;

    @Test
    void sendingAnAnnouncementNotifiesItsFrozenAudience() {
        var audience = seedTwoActiveMembers();

        var sent = inTransaction(() -> announcements.send("No 18:00 class on Friday", "EVERYONE", null));

        assertThat(notifications.findAll())
                .allSatisfy(n -> {
                    assertThat(n.getType()).isEqualTo(NotificationType.NEW_ANNOUNCEMENT.name());
                    // The delegation, asserted at the source: this row must never own read state.
                    assertThat(n.getReadAt()).isNull();
                    assertThat(n.getSourceId()).isEqualTo(sent.getId());
                })
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(audience.membershipIds());
    }

    @Test
    void theRowCarriesAPreviewAndASenderSoTheFeedNeedsNoSecondFetch() {
        seedTwoActiveMembers();

        inTransaction(() -> announcements.send("Short body", "EVERYONE", null));

        assertThat(notifications.findAll().getFirst().getParams())
                .containsEntry(NotificationType.BODY_PREVIEW, "Short body")
                .containsKey(NotificationType.SENT_BY_NAME);
    }

    @Test
    void aLongBodyIsTruncatedToThePreviewLength() {
        seedTwoActiveMembers();
        String longBody = "x".repeat(400);

        inTransaction(() -> announcements.send(longBody, "EVERYONE", null));

        String preview = (String) notifications.findAll().getFirst().getParams()
                .get(NotificationType.BODY_PREVIEW);
        assertThat(preview).hasSize(NotificationType.BODY_PREVIEW_CHARS);
    }

    @Test
    void aSystemSendCarriesANullSenderRatherThanAPlaceholder() {
        seedTwoActiveMembers();

        // The four-argument form with sentBy = null: V30's backfill and seed sends both do this,
        // and it is legitimate. The frontend renders "Your gym"; the row must not bake that in,
        // or the string would be untranslatable and wrong for a box that renames itself.
        inTransaction(() -> announcements.send("From the system", "EVERYONE", null, null));

        assertThat(notifications.findAll().getFirst().getParams())
                .doesNotContainKey(NotificationType.SENT_BY_NAME);
    }

    @Test
    void anAnnouncementToNobodyNotifiesNobody() {
        // EXPIRING with no expiring members resolves to an empty audience.
        seedTwoActiveMembersWithNoExpiringSubscriptions();

        inTransaction(() -> announcements.send("Renew soon", "EXPIRING", null));

        assertThat(notifications.count()).isZero();
    }
}
```

`inTransaction(...)` is a `TransactionTemplate` helper — `emit` is `Propagation.MANDATORY`, so a test calling a service method outside a transaction gets `IllegalTransactionStateException` rather than a useful failure. `AnnouncementService.send` is itself `@Transactional`, so calling it directly from a test method is enough; add the wrapper only if the test class needs it.

- [ ] **Step 2: Run and watch them fail**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='AnnouncementNotificationTest' > /tmp/m29b-t7.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t7.txt | head
```

Expected: 5 tests, 4 failures.

- [ ] **Step 3: Emit from `AnnouncementService.send`**

Add `NotificationService notifications` and `UserRepository users` to the constructor, then extend the four-argument `send` — after the recipient loop, still inside the same `@Transactional` method:

```java
        // Frozen here and never recomputed: a member who renews tomorrow keeps this message.
        List<UUID> audience = segments.resolve(segment, segmentRef);
        for (UUID membershipId : audience) {
            AnnouncementRecipient r = new AnnouncementRecipient();
            r.setAnnouncementId(a.getId());
            r.setMembershipId(membershipId);
            recipients.save(r);
        }

        // The feed fan-out is a read of the audience we just froze, not a second resolution
        // (M29a D-2). Same transaction as the recipient rows: an announcement that rolls back must
        // not leave notifications behind claiming it was sent.
        //
        // These rows carry NO read state. announcement_recipient.read_at above is the ONE marker,
        // and the feed derives its flag from it — two of them would disagree the first time
        // somebody read an announcement from the feed instead of the home card (M29b D-3).
        if (!audience.isEmpty()) {
            Map<String, Object> params = new HashMap<>();
            params.put(NotificationType.ANNOUNCEMENT_ID, a.getId().toString());
            params.put(NotificationType.BODY_PREVIEW, preview(a.getBody()));
            // A null sender is legitimate (V30's backfill, seed sends). The key is OMITTED rather
            // than set to a placeholder: "Your gym" is a translatable string the frontend owns, and
            // baking it in here would ship it in one language forever.
            if (sentBy != null) {
                users.findById(sentBy).ifPresent(u -> params.put(NotificationType.SENT_BY_NAME, u.getName()));
            }
            notifications.emitAll(NotificationType.NEW_ANNOUNCEMENT, audience, params);
        }
        return a;
    }

    /** Announcement bodies are user-written and unbounded; a feed row shows the opening of one. */
    private static String preview(String body) {
        return body.length() <= NotificationType.BODY_PREVIEW_CHARS
                ? body
                : body.substring(0, NotificationType.BODY_PREVIEW_CHARS);
    }
```

- [ ] **Step 4: Run the tests and the whole suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='AnnouncementNotificationTest' > /tmp/m29b-t7b.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t7b.txt | head
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t7-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t7-full.txt | tail -3
```

Expected: 5/5, then `BUILD SUCCESS`. M29a's announcement tests now also write notifications — if one asserts a row count over a shared table, read it before touching it.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/box/AnnouncementService.java backend/src/test/java/com/boxhub/notify/AnnouncementNotificationTest.java
git commit -m "feat(m29b): announcements reach the feed, sharing one read marker

The fan-out reads the audience M29a already froze rather than resolving the
segment a second time, and runs in the same transaction as the recipient rows.

These notification rows carry no read state at all: announcement_recipient
.read_at stays the one marker. Two of them would disagree the first time
somebody read an announcement from the feed instead of the home card.

A null sender omits the key rather than writing 'Your gym' — that string is
translatable and belongs to the frontend, not baked into a row in one
language forever.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 8: Money, membership and staff emitters

Four events across four files. Each hooks a transition the code already detects.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/MemberController.java` (`MEMBERSHIP_BLOCKED`)
- Modify: `backend/src/main/java/com/boxhub/box/StripeWebhookController.java:190` (`PAYMENT_FAILED`)
- Modify: `backend/src/main/java/com/boxhub/box/InvitePublicController.java:72,80` (`INVITE_ACCEPTED`)
- Modify: `backend/src/main/java/com/boxhub/box/BoxSignupService.java:113` (`NEW_MEMBER_JOINED`)
- Modify: `backend/src/main/java/com/boxhub/identity/MembershipRepository.java` (admin lookup)
- Test: `backend/src/test/java/com/boxhub/notify/MembershipNotificationTest.java`

**Interfaces:**
- Consumes: `NotificationService.emit` / `emitAll`
- Produces: `MembershipRepository.findByBoxIdAndRoleAndStatus(UUID, String, String)` returning `List<Membership>` — the staff audience, used by both staff-facing events.

- [ ] **Step 1: Add the admin lookup**

`MembershipRepository` has `countByBoxIdAndRoleAndStatus` and `findFirstByBoxIdAndRole` but nothing returning every admin. Add the derived query:

```java
/** The staff audience for INVITE_ACCEPTED and NEW_MEMBER_JOINED. Membership carries no @TenantId
 *  discriminator, so the box predicate is stated explicitly — never findAll(). */
List<Membership> findByBoxIdAndRoleAndStatus(UUID boxId, String role, String status);
```

- [ ] **Step 2: Write the failing tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class MembershipNotificationTest extends AbstractIntegrationTest {

    @Autowired NotificationRepository notifications;

    @Test
    void suspendingAMemberTellsThem() {
        var member = seedActiveAthleteMembership();

        patchMember(member.id(), suspendRequest());

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.MEMBERSHIP_BLOCKED.name());
            assertThat(n.getMembershipId()).isEqualTo(member.id());
            // Being unable to book with no explanation is the worst version of this.
            assertThat(n.getLink()).isEqualTo("/athlete/membership");
        });
    }

    @Test
    void reactivatingAMemberDoesNotFireTheBlockedEvent() {
        var member = seedSuspendedAthleteMembership();

        patchMember(member.id(), activateRequest());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aNoOpStatusPatchFiresNothing() {
        var member = seedActiveAthleteMembership();

        patchMember(member.id(), activateRequest());   // already ACTIVE

        // MemberController already guards MembershipEvent on an actual transition; this must too.
        assertThat(notifications.count()).isZero();
    }

    @Test
    void acceptingAnInviteTellsEveryBoxAdmin() {
        var admins = seedTwoActiveBoxAdmins();

        acceptInvite(seedPendingInvite());

        var rows = notifications.findAll().stream()
                .filter(n -> NotificationType.INVITE_ACCEPTED.name().equals(n.getType())).toList();
        assertThat(rows).extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(admins.membershipIds());
    }

    @Test
    void acceptingAnInviteDoesNotAlsoFireNewMemberJoined() {
        seedTwoActiveBoxAdmins();

        acceptInvite(seedPendingInvite());

        // D-14: both events would otherwise fire at InvitePublicController, giving admins two rows
        // for one person joining. They are mutually exclusive by construction, not by filtering.
        assertThat(notifications.findAll())
                .noneSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.NEW_MEMBER_JOINED.name()));
    }

    @Test
    void aFailedPaymentReachesTheFeedAsWellAsTheInbox() {
        var member = seedMemberWithSubscription();

        deliverStripePaymentFailedWebhook(member.subscriptionId());

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.PAYMENT_FAILED.name());
            assertThat(n.getMembershipId()).isEqualTo(member.membershipId());
            // The row must carry this box's id, not the root sentinel: the webhook has no JWT and
            // runs inside runAsBox. A sentinel box_id would make the row invisible to its reader.
            assertThat(n.getBoxId()).isEqualTo(member.boxId());
        });
    }
}
```

- [ ] **Step 3: Emit `MEMBERSHIP_BLOCKED`**

`MemberController` already captures `previousStatus` and guards on an actual transition. Extend the existing `if (kind != null)` block rather than adding a second comparison:

```java
            if (kind != null) {
                UUID actorMembershipId = memberships.findByUserIdAndBoxId(TenantContext.userId(), boxId)
                        .map(Membership::getId).orElse(null);
                membershipEvents.save(new MembershipEvent(m.getId(), kind, actorMembershipId, null));

                // Only the blocking direction. Reactivation is good news the member finds out by
                // being able to book again; being blocked with no explanation is not.
                if (MembershipEvent.SUSPENDED.equals(kind)) {
                    notifications.emit(NotificationType.MEMBERSHIP_BLOCKED, m.getId(), Map.of());
                }
            }
```

- [ ] **Step 4: Emit `PAYMENT_FAILED` inside the webhook's transaction**

In `StripeWebhookController`, inside the `TenantContext.runAsBox(boxId, () -> tx.execute(...))` block that saves the payment at roughly line 190 — **not** beside `receipts.sendPaymentFailed(...)` at roughly line 196, which is deliberately outside the block so the mail fires after commit:

```java
                payments.save(p);

                // Inside the tx, unlike the mail below it: the mail is delivery and cannot be
                // retracted, the feed row is persistence and must vanish with a rollback (D-4).
                // This is the whole reason the two are in different places.
                notifications.emit(NotificationType.PAYMENT_FAILED, subscription.getMembershipId(),
                        Map.of(NotificationType.AMOUNT_CENTS, p.getAmountCents(),
                               NotificationType.CURRENCY, p.getCurrency()));
```

- [ ] **Step 5: Emit `INVITE_ACCEPTED`**

In `InvitePublicController`, at both sites where `MembershipEvent.JOINED` is saved (roughly lines 72 and 80), after the save:

```java
                notifyAdmins(NotificationType.INVITE_ACCEPTED,
                        Map.of(NotificationType.INVITEE_NAME, r.membership().getUser().getName()));
```

with the helper in that class:

```java
/** Staff-facing events go to every ACTIVE box admin. Membership carries no @TenantId
 *  discriminator, so the box predicate is explicit (SessionDetailController.detail's pattern). */
private void notifyAdmins(NotificationType type, Map<String, Object> params) {
    List<UUID> admins = memberships
            .findByBoxIdAndRoleAndStatus(TenantContext.requireBoxId(), "BOX_ADMIN", "ACTIVE")
            .stream().map(Membership::getId).toList();
    notifications.emitAll(type, admins, params);
}
```

- [ ] **Step 6: Emit `NEW_MEMBER_JOINED` — and only where an invite was not involved**

In `BoxSignupService` at the `MembershipEvent.JOINED` save (roughly line 113), emit `NEW_MEMBER_JOINED` to the box admins using the same helper shape. **Do not add it to `InvitePublicController`.** D-14: an invite being accepted *is* a new member joining, and firing both would give every admin two rows for one person.

Verify the exclusivity holds after the edit — this grep must show `INVITE_ACCEPTED` only in the invite file and `NEW_MEMBER_JOINED` only outside it:

```bash
cd ~/dev/boxhub
grep -rn "INVITE_ACCEPTED\|NEW_MEMBER_JOINED" backend/src/main/java/com/boxhub --include='*.java' | grep -v NotificationType.java
```

- [ ] **Step 7: Run the tests and the whole suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='MembershipNotificationTest' > /tmp/m29b-t8.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t8.txt | head
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t8-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t8-full.txt | tail -3
```

Expected: 6/6, then `BUILD SUCCESS`.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub backend/src/main/java/com/boxhub/identity/MembershipRepository.java backend/src/test/java/com/boxhub/notify/MembershipNotificationTest.java
git commit -m "feat(m29b): blocked memberships, failed payments and new members reach the feed

PAYMENT_FAILED emits inside the webhook's existing runAsBox transaction, next
to payments.save — not beside sendPaymentFailed, which sits outside it on
purpose so the mail fires after commit. The mail is delivery and cannot be
retracted; the feed row is persistence and must vanish with a rollback.

INVITE_ACCEPTED and NEW_MEMBER_JOINED are mutually exclusive by construction
(D-14): an invite being accepted IS a new member joining, and firing both
would give every admin two rows for one person.

MEMBERSHIP_BLOCKED reuses MemberController's existing transition guard, so a
no-op PATCH stays silent. Only the blocking direction fires — reactivation is
good news you discover by being able to book again.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 9: Restructure the no-show sweep off `runAsRoot` — **ORCHESTRATOR ONLY**

> **Do not dispatch this to an executor.** CLAUDE.md reserves tenancy work for the orchestrator, and this is a change to a shipped nightly job whose current comment states the precondition the change breaks. A wrong diff here writes rows nobody can ever see.

`BookingMaintenance` runs the sweep under `TenantContext.runAsRoot(...)`, and its own comment says why that is safe today: *"The sweep flips status on already-loaded Booking rows and never INSERTs a `@TenantId` row."* Emitting `NO_SHOW_RECORDED` from inside `sweepNoShows` breaks exactly that. The inserts would take `box_id` from the root sentinel and be invisible to the members they were written for. A nested `runAsBox` does not rescue it: setting the tenant on an already-open Hibernate session is a documented no-op.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingMaintenance.java`
- Modify: `backend/src/main/java/com/boxhub/box/BookingService.java` — `sweepNoShows` emits
- Test: `backend/src/test/java/com/boxhub/notify/NoShowSweepTenancyTest.java`

**Interfaces:**
- Consumes: `BoxRepository.findAll()` (Box carries no `@TenantId`, so this is safe tenant-agnostically — the same reasoning `SubscriptionLapseJob.sweepAll` and `SessionGenerator.generateAll` already document)
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the tenancy test first**

This is the assertion the whole task exists for. It fails today for a reason no other test would report clearly.

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

class NoShowSweepTenancyTest extends AbstractIntegrationTest {

    @Autowired BookingMaintenance maintenance;
    @Autowired NotificationRepository notifications;

    @Test
    void theSweepNotifiesEachBoxsMembersUnderTheirOwnBoxId() {
        // Two boxes, each with one member booked onto a session that has already started and was
        // never checked in. Seed startAt explicitly relative to now — a precondition that depends
        // on the time of day is a broken test, not a caveat to document.
        var boxA = seedBoxWithUnmarkedBooking(Instant.now().minus(2, ChronoUnit.HOURS));
        var boxB = seedBoxWithUnmarkedBooking(Instant.now().minus(2, ChronoUnit.HOURS));

        maintenance.sweep();

        // Read across both boxes: runAsRoot for the ASSERTION is correct — this is a platform-wide
        // read, not a thread serving a user.
        var all = com.boxhub.shared.TenantContext.runAsRoot(() -> notifications.findAll());

        assertThat(all).hasSize(2).allSatisfy(n ->
                assertThat(n.getType()).isEqualTo(NotificationType.NO_SHOW_RECORDED.name()));
        // The point of the whole task: each row carries ITS OWN box, never a shared sentinel.
        assertThat(all).extracting(Notification::getBoxId)
                .containsExactlyInAnyOrder(boxA.boxId(), boxB.boxId());
        assertThat(all).extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrder(boxA.membershipId(), boxB.membershipId());
    }

    @Test
    void aMemberSeesTheirOwnNoShowThroughTheirOwnTenant() {
        var boxA = seedBoxWithUnmarkedBooking(Instant.now().minus(2, ChronoUnit.HOURS));

        maintenance.sweep();

        // A sentinel box_id would make this read return empty even though the row exists — which
        // is precisely the failure mode a count-only assertion would miss.
        var mine = com.boxhub.shared.TenantContext.runAsBox(boxA.boxId(),
                () -> notifications.findByMembershipIdAndTypeInAndReadAtIsNull(
                        boxA.membershipId(), java.util.List.of(NotificationType.NO_SHOW_RECORDED.name())));

        assertThat(mine).hasSize(1);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NoShowSweepTenancyTest' > /tmp/m29b-t9.txt 2>&1; echo $?
grep -E "Tests run|FAIL|expected" /tmp/m29b-t9.txt | head
```

Expected: 2 failures, both because zero notifications exist — nothing emits yet.

- [ ] **Step 3: Restructure `BookingMaintenance`**

Replace `runAsRoot` with the per-box loop. Rewrite the class comment too: the old one documents a precondition that no longer holds, and leaving it would tell the next reader the opposite of the truth.

```java
/**
 * Nightly no-show sweep, across every box. Delegates to BookingService (proxied) so its
 * @Transactional applies.
 *
 * <p><b>Why per-box rather than runAsRoot.</b> This job used to wrap the whole sweep in
 * TenantContext.runAsRoot, which was safe only because the sweep flipped status on already-loaded
 * Booking rows and never INSERTed a @TenantId row. Since M29b it emits NO_SHOW_RECORDED, and a
 * notification IS a @TenantId row — under root it would take the sentinel box_id and be invisible
 * to the member it was written for. Nesting runAsBox inside the sweep does not help: setting the
 * tenant on an already-open Hibernate session is a no-op. So the job now iterates boxes and
 * installs each box's tenant BEFORE the transaction opens, the shape SubscriptionLapseJob.sweepAll
 * and SessionGenerator.generateAll already use. Box carries no @TenantId, so boxes.findAll() is
 * safe tenant-agnostically.
 */
@Component
public class BookingMaintenance {

    private final BoxRepository boxes;
    private final BookingService bookingService;

    public BookingMaintenance(BoxRepository boxes, BookingService bookingService) {
        this.boxes = boxes;
        this.bookingService = bookingService;
    }

    @Scheduled(cron = "0 45 3 * * *")
    public void sweep() {
        for (Box b : boxes.findAll()) {
            // runAsBox wraps the CALL, not the body: sweepNoShows is @Transactional and proxied,
            // so the tenant must be installed before the transaction and session open.
            TenantContext.runAsBox(b.getId(), () -> bookingService.sweepNoShows(Instant.now()));
        }
    }
}
```

Keep the existing cron expression and method name exactly as they are — read the file and preserve them; the values above are illustrative of the shape, not a licence to change the schedule.

- [ ] **Step 4: Emit from `sweepNoShows`**

```java
    /** Nightly sweep target: flips unmarked BOOKED -> NO_SHOW for sessions that already started.
     *  Runs under ONE box's tenant per call (see BookingMaintenance) — never runAsRoot, because
     *  the notification below is a @TenantId insert. */
    @Transactional
    public int sweepNoShows(Instant before) {
        int flipped = 0;
        for (ClassSession s : sessions.findByStatusAndStartAtBefore("SCHEDULED", before)) {
            for (Booking b : bookings.findBySessionId(s.getId())) {
                if ("BOOKED".equals(b.getStatus())) {
                    b.setStatus("NO_SHOW");
                    bookings.save(b);
                    notifications.emit(NotificationType.NO_SHOW_RECORDED, b.getMembershipId(),
                            Map.of(NotificationType.SESSION_ID, s.getId().toString(),
                                   NotificationType.CLASS_NAME, s.getName(),
                                   NotificationType.START_AT, s.getStartAt().toString()));
                    flipped++;
                }
            }
        }
        return flipped;
    }
```

- [ ] **Step 5: Verify the gate**

```bash
cd ~/dev/boxhub
grep -rn "runAsRoot" backend/src/main/java/com/boxhub/box/BookingMaintenance.java; echo "exit=$?"
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' > /tmp/m29b-t9-grep.txt 2>&1; echo "controllers exit=$?"
cat /tmp/m29b-t9-grep.txt
```

Expected: no `runAsRoot` left in `BookingMaintenance`, and the controller grep produces no output.

- [ ] **Step 6: Run the tests and the whole suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NoShowSweepTenancyTest' > /tmp/m29b-t9b.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t9b.txt | head
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t9-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t9-full.txt | tail -3
```

Expected: 2/2, then `BUILD SUCCESS`. Any existing `BookingMaintenance` test that asserted the sweep ran once must now expect once per box.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/box/BookingMaintenance.java backend/src/main/java/com/boxhub/box/BookingService.java backend/src/test/java/com/boxhub/notify/NoShowSweepTenancyTest.java
git commit -m "fix(m29b)!: the no-show sweep iterates boxes instead of running as root

BookingMaintenance wrapped the sweep in runAsRoot, safe only under the
precondition its own comment stated: the sweep flips status on already-loaded
rows and never INSERTs a @TenantId row. Emitting NO_SHOW_RECORDED breaks that
— under root the notification takes the sentinel box_id and is invisible to
the member it was written for. Nesting runAsBox inside does not help: setting
the tenant on an open Hibernate session is a no-op.

Now iterates boxes and installs each tenant before the transaction opens, the
shape SubscriptionLapseJob and SessionGenerator already use. Covered by a
two-box test asserting each row carries its OWN box_id, and a second reading
one back through its own tenant — a count-only assertion would pass with a
sentinel.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 10: `SubscriptionExpiringJob`

Warning beats condolence: today a member learns their membership ended only after it lapsed.

**Files:**
- Create: `backend/src/main/java/com/boxhub/notify/SubscriptionExpiringJob.java`
- Test: `backend/src/test/java/com/boxhub/notify/SubscriptionExpiringJobTest.java`

**Interfaces:**
- Consumes: `BoxRepository`, `SubscriptionRepository`, `PlanRepository`, `NotificationService`, `SegmentResolver.EXPIRING_SOON_DAYS`
- Produces: `sweepAll()` and package-private `sweepBox(UUID)` — tests call `sweepBox` directly, since cron will not fire inside a test run.

- [ ] **Step 1: Write the job**

Modelled on `SubscriptionLapseJob`, which is the reference for this exact shape.

```java
package com.boxhub.notify;

import com.boxhub.box.*;
import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

/**
 * Nightly: warn every member whose subscription ends within EXPIRING_SOON_DAYS. Registry §4.3 —
 * before this, the only membership-ending mail was SubscriptionLapseJob's, sent after the fact.
 *
 * <p><b>The number is EXPIRING_SOON_DAYS and nothing else.</b> HomeController's athlete banner used
 * to hardcode 7 while this rule used 14; M29b Task 1 deleted that literal, so the banner, the staff
 * "expiring" segment, the members-table chip and this event now answer one question.
 *
 * <p><b>Tenancy.</b> Subscription is @TenantId and the sweep is inherently cross-box, so there is no
 * single JWT to run it under. Same fix as SubscriptionLapseJob: iterate boxes (Box carries no
 * @TenantId, so findAll() is safe) and install each box's tenant via runAsBox BEFORE opening the
 * transaction. Never runAsRoot — this INSERTs @TenantId rows.
 *
 * <p><b>Idempotence.</b> Running nightly for fourteen nights must warn a member once, which is what
 * NotificationType.SUBSCRIPTION_EXPIRING's dedupe key (subscription + period end) buys. A renewal
 * changes the period end and legitimately re-arms the warning.
 */
@Component
public class SubscriptionExpiringJob {

    private final BoxRepository boxes;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public SubscriptionExpiringJob(BoxRepository boxes, SubscriptionRepository subscriptions,
                                   PlanRepository plans, NotificationService notifications,
                                   PlatformTransactionManager txManager) {
        this.boxes = boxes;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.notifications = notifications;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Nightly, every box. Cron won't fire during short test runs — tests call sweepBox directly. */
    @Scheduled(cron = "0 15 4 * * *")
    public void sweepAll() {
        for (Box b : boxes.findAll()) {
            sweepBox(b.getId());
        }
    }

    void sweepBox(UUID boxId) {
        Instant cutoff = Instant.now().plus(SegmentResolver.EXPIRING_SOON_DAYS, ChronoUnit.DAYS);
        TenantContext.runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            for (Subscription sub : subscriptions.findByStatusAndCurrentPeriodEndBefore("ACTIVE", cutoff)) {
                // A grandfathered subscription has a null period end and is never expiring — the
                // SQL comparison is UNKNOWN, not TRUE, so it falls out of the WHERE clause for free
                // (the same reasoning SubscriptionLapseJob documents).
                Plan plan = plans.findById(sub.getPlanId()).orElse(null);
                notifications.emit(NotificationType.SUBSCRIPTION_EXPIRING, sub.getMembershipId(),
                        Map.of(NotificationType.SUBSCRIPTION_ID, sub.getId().toString(),
                               NotificationType.ENDS_AT, sub.getCurrentPeriodEnd().toString(),
                               NotificationType.PLAN_NAME, plan == null ? "" : plan.getName()));
            }
        }));
    }
}
```

**Check `findByStatusAndCurrentPeriodEndBefore`'s exact name and signature in `SubscriptionRepository` before relying on it** — `SubscriptionLapseJob` calls it with `Instant.now()`; reusing it with a future cutoff is the intent, but confirm the method exists and takes `(String, Instant)`.

- [ ] **Step 2: Write the tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class SubscriptionExpiringJobTest extends AbstractIntegrationTest {

    @Autowired SubscriptionExpiringJob job;
    @Autowired NotificationRepository notifications;

    @Test
    void aSubscriptionEndingInsideTheWindowIsWarnedOnce() {
        var seeded = seedActiveSubscriptionEndingIn(Duration.ofDays(10));

        job.sweepBox(seeded.boxId());
        job.sweepBox(seeded.boxId());   // the second night, and the third, and the fourteenth

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.SUBSCRIPTION_EXPIRING.name());
            assertThat(n.getMembershipId()).isEqualTo(seeded.membershipId());
        });
    }

    @Test
    void aSubscriptionEndingOutsideTheWindowIsNotWarned() {
        var seeded = seedActiveSubscriptionEndingIn(Duration.ofDays(30));

        job.sweepBox(seeded.boxId());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aGrandfatheredSubscriptionWithNoEndIsNeverExpiring() {
        var seeded = seedActiveSubscriptionWithNoPeriodEnd();

        job.sweepBox(seeded.boxId());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void theWindowIsTheOneSharedConstant() {
        // 13 days out is inside EXPIRING_SOON_DAYS (14) and outside the 7 HomeController used to
        // hardcode. If this fails, Task 1 was reverted and the banner disagrees with this badge.
        var seeded = seedActiveSubscriptionEndingIn(Duration.ofDays(13));

        job.sweepBox(seeded.boxId());

        assertThat(notifications.count()).isOne();
    }
}
```

- [ ] **Step 3: Run**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='SubscriptionExpiringJobTest' > /tmp/m29b-t10.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t10.txt | head
```

Expected: 4 tests, 0 failures.

- [ ] **Step 4: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/notify/SubscriptionExpiringJob.java backend/src/test/java/com/boxhub/notify/SubscriptionExpiringJobTest.java
git commit -m "feat(m29b): warn members before a membership expires, not after

Registry §4.3: the only membership-ending message was SubscriptionLapseJob's
mail, sent after the fact. Warning beats condolence.

Runs per box under runAsBox, never runAsRoot — it INSERTs @TenantId rows. The
dedupe key is subscription + period end, so fourteen nightly runs warn a
member once and a renewal legitimately re-arms the warning.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 11: `ClassReminderScheduler` — built now, delivered by M27c

The scheduler is the hard, reusable half. M27c adds transport only. `CLASS_STARTING_SOON` writes a real row that the feed excludes (`showsInFeed = false`), so the sweep is assertable and deduped before push exists.

**Files:**
- Create: `backend/src/main/java/com/boxhub/notify/ClassReminderScheduler.java`
- Modify: `backend/src/main/java/com/boxhub/box/ClassSessionRepository.java` — add the window query
- Test: `backend/src/test/java/com/boxhub/notify/ClassReminderSchedulerTest.java`
- Modify: `docs/NOTIFICATIONS.md` §5.5 and §4.1 (spec §3)

**Interfaces:**
- Consumes: `BoxRepository`, `ClassSessionRepository`, `BookingRepository`, `Box.getClassReminderMinutes()`
- Produces: `sweepAll()` and package-private `sweepBox(UUID boxId, Instant now)` — the injected `now` is what makes this testable without sleeping.

- [ ] **Step 1: Add the window query**

In `ClassSessionRepository`:

```java
/** Sessions starting inside a window. The reminder sweep's only read; indexed on start_at. */
List<ClassSession> findByStatusAndStartAtBetween(String status, Instant from, Instant to);
```

- [ ] **Step 2: Write the scheduler**

```java
package com.boxhub.notify;

import com.boxhub.box.*;
import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Fires CLASS_STARTING_SOON box.class_reminder_minutes before a session starts.
 *
 * <p><b>Nothing renders these rows yet.</b> showsInFeed is false for this type, because an in-app
 * "starts in 1 hour" read at 9pm is noise. The row exists so the sweep is assertable, so dedupe
 * works, and so M27c adds a transport rather than a scheduler (M29b D-11). This is why registry
 * §5.5 now reads "no event without a reader IN THE MILESTONE THAT DELIVERS IT", and why spec §8
 * puts these rows under the same 90-day retention as every other.
 *
 * <p><b>The window is wider than the interval, on purpose.</b> A one-minute sweep matched to a
 * one-minute window loses every reminder in any minute the job does not run — a redeploy, a slow
 * run, a paused container. The window looks back further and leans on the dedupe key (the session
 * id) to make the overlap free: a session already reminded is skipped, so re-covering the same
 * minute costs one indexed existence check and notifies nobody twice.
 *
 * <p><b>Recipients are BOOKED only, never the waitlist.</b> Someone waiting for a spot has no place
 * to turn up to; telling them their class starts in an hour would be a lie. This is the one place
 * M29a's D-7 rule (waitlist included) deliberately does not apply.
 */
@Component
public class ClassReminderScheduler {

    /** How far back the window reaches beyond the sweep interval. See the class comment. */
    static final Duration CATCH_UP = Duration.ofMinutes(5);

    private final BoxRepository boxes;
    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public ClassReminderScheduler(BoxRepository boxes, ClassSessionRepository sessions,
                                  BookingRepository bookings, NotificationService notifications,
                                  PlatformTransactionManager txManager) {
        this.boxes = boxes;
        this.sessions = sessions;
        this.bookings = bookings;
        this.notifications = notifications;
        this.tx = new TransactionTemplate(txManager);
    }

    @Scheduled(cron = "0 * * * * *")
    public void sweepAll() {
        Instant now = Instant.now();
        for (Box b : boxes.findAll()) {
            sweepBox(b.getId(), now);
        }
    }

    /** One box. `now` is injected so a test never has to wait for a clock. */
    void sweepBox(UUID boxId, Instant now) {
        TenantContext.runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            Box box = boxes.findById(boxId).orElseThrow();
            Duration lead = Duration.ofMinutes(box.getClassReminderMinutes());
            Instant from = now.plus(lead).minus(CATCH_UP);
            Instant to = now.plus(lead);

            for (ClassSession s : sessions.findByStatusAndStartAtBetween("SCHEDULED", from, to)) {
                List<UUID> booked = bookings.findBySessionId(s.getId()).stream()
                        .filter(b -> "BOOKED".equals(b.getStatus()) || "CHECKED_IN".equals(b.getStatus()))
                        .map(Booking::getMembershipId)
                        .distinct()
                        .toList();
                notifications.emitAll(NotificationType.CLASS_STARTING_SOON, booked,
                        Map.of(NotificationType.SESSION_ID, s.getId().toString(),
                               NotificationType.CLASS_NAME, s.getName(),
                               NotificationType.START_AT, s.getStartAt().toString()));
            }
        }));
    }
}
```

- [ ] **Step 3: Write the tests**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

class ClassReminderSchedulerTest extends AbstractIntegrationTest {

    @Autowired ClassReminderScheduler scheduler;
    @Autowired NotificationRepository notifications;

    @Test
    void aClassStartingInTheLeadTimeRemindsItsBookedMembers() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedBookedSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));   // default lead 60

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.CLASS_STARTING_SOON.name());
            assertThat(n.getMembershipId()).isEqualTo(seeded.bookedMembershipId());
        });
    }

    @Test
    void runningEveryMinuteRemindsOnce() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedBookedSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));

        // The overlapping window re-covers this session on each of the next four sweeps.
        scheduler.sweepBox(seeded.boxId(), now);
        scheduler.sweepBox(seeded.boxId(), now.plus(1, ChronoUnit.MINUTES));
        scheduler.sweepBox(seeded.boxId(), now.plus(2, ChronoUnit.MINUTES));

        assertThat(notifications.count()).isOne();
    }

    @Test
    void aWaitlistedMemberIsNotReminded() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedSessionStartingAtWithBookedAndWaitlisted(now.plus(60, ChronoUnit.MINUTES));

        scheduler.sweepBox(seeded.boxId(), now);

        // They have no place to turn up to. Reminding them would be a lie.
        assertThat(notifications.findAll()).extracting(Notification::getMembershipId)
                .containsExactly(seeded.bookedMembershipId());
    }

    @Test
    void aClassOutsideTheWindowIsNotReminded() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedBookedSessionStartingAt(now.plus(4, ChronoUnit.HOURS));

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aCancelledClassIsNotReminded() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedCancelledSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isZero();
    }

    @Test
    void theLeadTimeIsPerBox() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedBoxWithReminderMinutesAndBookedSessionAt(30, now.plus(30, ChronoUnit.MINUTES));

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isOne();
    }

    @Test
    void theseRowsNeverReachTheFeed() {
        Instant now = Instant.parse("2026-09-10T05:00:00Z");
        var seeded = seedBookedSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));
        scheduler.sweepBox(seeded.boxId(), now);

        // showsInFeed=false. Until M27c gives this a transport, the row exists and is shown to
        // nobody — which registry §5.5 permits only because a delivery milestone is named.
        assertThat(notifications.countUnread(seeded.bookedMembershipId(), NotificationType.feedTypeNames()))
                .isZero();
    }
}
```

- [ ] **Step 4: Run**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='ClassReminderSchedulerTest' > /tmp/m29b-t11.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t11.txt | head
```

Expected: 7 tests, 0 failures.

- [ ] **Step 5: Measure what a per-minute sweep across every box actually costs**

Spec §13 names this as a risk and says it is measured before merge, so measure it rather than
asserting it is fine. The sweep must be an indexed range scan per box, not a table scan.

```bash
cd ~/dev/boxhub
docker compose -f docker/docker-compose.yml exec -T db psql -U boxhub -d boxhub -c \
  "explain analyze select * from class_sessions where status = 'SCHEDULED' and start_at between now() and now() + interval '1 hour';"
```

Expected: an index scan on `start_at`. **A `Seq Scan` is a finding, not a detail** — report it and add
the index rather than shipping a full scan that runs sixty times an hour per box.

- [ ] **Step 6: Amend the registry**

In `docs/NOTIFICATIONS.md`:
1. Replace §5.5's rule with the spec §3 text ("no event without a reader **in the milestone that delivers it**").
2. In §4.1's `CLASS_STARTING_SOON` row, change *"Opt-out, and off by default"* to **on by default, opt-out**, with the spec's reason: it fires only for a class the athlete booked themselves, so it is not unsolicited. Note the reversal is one line if a pilot box disagrees.
3. Update the `Owner` column for `CLASS_STARTING_SOON` to *"M29b schedules, M27c delivers"*.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/notify/ClassReminderScheduler.java backend/src/main/java/com/boxhub/box/ClassSessionRepository.java backend/src/test/java/com/boxhub/notify/ClassReminderSchedulerTest.java docs/NOTIFICATIONS.md
git commit -m "feat(m29b): schedule class reminders now, deliver them in M27c

The scheduler is the hard, reusable half; M27c adds a transport rather than
building both. The rows are written and deduped but showsInFeed is false, so
nothing renders them — an in-app 'starts in 1 hour' read at 9pm is noise.

The sweep window is wider than its one-minute interval on purpose: matched
exactly, every minute the job misses loses its reminders. The session-id
dedupe key makes the overlap free.

BOOKED only, never the waitlist — someone waiting for a spot has nowhere to
turn up to, so M29a's D-7 deliberately does not apply here.

Amends NOTIFICATIONS.md §5.5 to permit an event recorded before its channel
exists when the delivery milestone is named, and flips §4.1's default to on:
a reminder for a class you booked yourself is not unsolicited.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 12: Retention

Registry §5.5's real fear is a table that grows forever — the price of admitting `CLASS_STARTING_SOON`'s invisible rows.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/PurgeJob.java`
- Test: `backend/src/test/java/com/boxhub/shared/PurgeJobTest.java` (extend the existing class)

**Interfaces:**
- Consumes: `NotificationRepository.purge(Instant)` from Task 2 — native, deliberately tenant-agnostic.

- [ ] **Step 1: Write the failing test**

Add to the existing `PurgeJobTest`, matching its fixture style. It already autowires `purgeJob`; add
`@Autowired NotificationRepository notifications;` alongside its existing repositories.

```java
@Test
void notificationsOlderThanNinetyDaysArePurged() {
    UUID fresh = seedNotificationCreatedAt(Instant.now().minus(10, ChronoUnit.DAYS));
    UUID stale = seedNotificationCreatedAt(Instant.now().minus(120, ChronoUnit.DAYS));

    purgeJob.purge();

    var remaining = TenantContext.runAsRoot(() -> notifications.findAll())
            .stream().map(Notification::getId).toList();
    assertThat(remaining).contains(fresh).doesNotContain(stale);
}

@Test
void anUnreadNotificationIsPurgedToo() {
    // A 90-day-old unread notification is not actionable, and keeping it forever is exactly the
    // table-that-grows-forever registry §5.5 warns about.
    UUID staleUnread = seedUnreadNotificationCreatedAt(Instant.now().minus(120, ChronoUnit.DAYS));

    purgeJob.purge();

    assertThat(TenantContext.runAsRoot(() -> notifications.findAll()))
            .extracting(Notification::getId).doesNotContain(staleUnread);
}
```

- [ ] **Step 2: Add the rule**

`PurgeJob` runs under no tenant, so the notification delete must be the native, tenant-agnostic `purge(...)` — a derived delete would be silently filtered to the sentinel and remove nothing.

```java
    /** A 90-day-old notification is not actionable; see spec §8. Longer than GRACE because these
     *  are the user's own history, not security evidence. */
    private static final Duration NOTIFICATION_RETENTION = Duration.ofDays(90);
```

Inside `purge()`:

```java
        // Native and tenant-agnostic on purpose: this job holds no tenant, and a derived delete
        // would filter to the NO_TENANT sentinel and remove nothing at all.
        int notifs = notifications.purge(Instant.now().minus(NOTIFICATION_RETENTION));
```

and add `{} notifications` to the existing `log.info` format string and its arguments.

- [ ] **Step 3: Run**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='PurgeJobTest' > /tmp/m29b-t12.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t12.txt | head
```

Expected: the class's existing tests plus 2, all green.

- [ ] **Step 4: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/shared/PurgeJob.java backend/src/test/java/com/boxhub/shared/PurgeJobTest.java
git commit -m "feat(m29b): purge notifications after 90 days

The price of admitting CLASS_STARTING_SOON's invisible rows: registry §5.5's
real concern is a table that grows forever, and a 90-day-old notification is
not actionable whether it was read or not.

Uses the native tenant-agnostic delete — PurgeJob holds no tenant, and a
derived delete would filter to the NO_TENANT sentinel and remove nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 13: `NotificationController` — the feed API

Four endpoints. The delegation lives here, and so does the test that proves it.

**Files:**
- Create: `backend/src/main/java/com/boxhub/notify/NotificationController.java`
- Modify: `backend/src/main/java/com/boxhub/box/AnnouncementRecipientRepository.java` — batch lookup
- Test: `backend/src/test/java/com/boxhub/notify/NotificationApiTest.java`
- Test: `backend/src/test/java/com/boxhub/notify/ReadStateDelegationTest.java`

**Interfaces:**
- Consumes: `NotificationRepository`, `AnnouncementRecipientRepository`, `MembershipRepository`, `NotificationType.feedTypeNames()`
- Produces: `GET /api/box/notifications`, `GET /api/box/notifications/unread-count`, `POST /api/box/notifications/{id}/read`, `POST /api/box/notifications/read-all`. Task 15 registers all four; the frontend service in Task 16 calls them.

- [ ] **Step 1: Add the batch lookup**

In `AnnouncementRecipientRepository`:

```java
/** The feed's read flags for one page: ONE query for every announcement row on it, never one
 *  lookup per row — the N+1 shape GET /api/box/me/announcements shipped with and had to fix. */
List<AnnouncementRecipient> findByMembershipIdAndAnnouncementIdIn(UUID membershipId,
                                                                  Collection<UUID> announcementIds);
```

- [ ] **Step 2: Write the controller**

```java
package com.boxhub.notify;

import com.boxhub.box.AnnouncementRecipient;
import com.boxhub.box.AnnouncementRecipientRepository;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/** The member's own feed. Member-scoped throughout: no id from a request ever selects a person. */
@RestController
@RequestMapping("/api/box/notifications")
public class NotificationController {

    private static final int PAGE_SIZE = 30;

    private final NotificationRepository notifications;
    private final AnnouncementRecipientRepository recipients;
    private final MembershipRepository memberships;

    public NotificationController(NotificationRepository notifications,
                                  AnnouncementRecipientRepository recipients,
                                  MembershipRepository memberships) {
        this.notifications = notifications;
        this.recipients = recipients;
        this.memberships = memberships;
    }

    public record FeedRow(UUID id, String type, Map<String, Object> params, String link,
                          Instant createdAt, boolean read) {}
    /** nextCursor is null on the last page — the frontend stops when it is. */
    public record FeedPage(List<FeedRow> rows, String nextCursor) {}
    public record UnreadCount(long count) {}

    /**
     * One page, newest first. `cursor` is optional and MUST stay optional: a required @RequestParam
     * makes Spring 400 the request before RoleGuard runs, so the authz sweep would never exercise
     * the role check on this route (AuthzConformanceTest's own documented trap).
     */
    @GetMapping
    @Transactional(readOnly = true)
    public FeedPage list(@RequestParam(required = false) String cursor) {
        UUID me = me().getId();
        List<String> types = NotificationType.feedTypeNames();

        // One extra row is the "is there a next page?" probe — cheaper and more honest than a
        // count query, which would race an emit between the two statements.
        var page = PageRequest.of(0, PAGE_SIZE + 1);
        List<Notification> rows = cursor == null
                ? notifications.firstPage(me, types, page)
                : decode(cursor).map(c -> notifications.pageAfter(me, types, c.createdAt(), c.id(), page))
                                .orElseGet(() -> notifications.firstPage(me, types, page));

        boolean hasMore = rows.size() > PAGE_SIZE;
        if (hasMore) rows = rows.subList(0, PAGE_SIZE);

        Set<UUID> readAnnouncements = readAnnouncementIds(me, rows);

        List<FeedRow> out = rows.stream().map(n -> new FeedRow(
                n.getId(), n.getType(), n.getParams(), n.getLink(), n.getCreatedAt(),
                isRead(n, readAnnouncements))).toList();

        String next = hasMore && !rows.isEmpty()
                ? encode(rows.getLast().getCreatedAt(), rows.getLast().getId())
                : null;
        return new FeedPage(out, next);
    }

    /**
     * The bell's badge. Deliberately a sum of two counts rather than a join: announcements are
     * counted from announcement_recipient, which is the ONE read marker for them (D-3), and that
     * is the same number HomeController already computes for the home card's badge.
     */
    @GetMapping("/unread-count")
    @Transactional(readOnly = true)
    public UnreadCount unreadCount() {
        UUID me = me().getId();
        List<String> owned = NotificationType.feedTypeNames().stream()
                .filter(t -> !NotificationType.NEW_ANNOUNCEMENT.name().equals(t)).toList();
        return new UnreadCount(notifications.countUnread(me, owned)
                + recipients.countByMembershipIdAndReadAtIsNull(me));
    }

    /**
     * {id} is a NOTIFICATION id resolved against MY membership — a member passing someone else's
     * gets 404, never that row.
     */
    @PostMapping("/{id}/read")
    @Transactional
    public void read(@PathVariable UUID id) {
        UUID me = me().getId();
        Notification n = notifications.findByIdAndMembershipId(id, me)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        markRead(me, n);
    }

    @PostMapping("/read-all")
    @Transactional
    public void readAll() {
        UUID me = me().getId();
        for (Notification n : notifications.findByMembershipIdAndTypeInAndReadAtIsNull(
                me, NotificationType.feedTypeNames())) {
            markRead(me, n);
        }
        // Announcements are not in the loop above — their unread state is not on the notification
        // row at all. Marking them here is what makes "Mark all read" clear the bell completely.
        for (AnnouncementRecipient r : recipients.findMineRaw(me)) {
            if (r.getReadAt() == null) {
                r.setReadAt(Instant.now());
                recipients.save(r);
            }
        }
    }

    /**
     * The delegation, in one place. An announcement's read state lives in announcement_recipient
     * and NOWHERE else: writing notification.read_at here would create the second marker this
     * milestone exists to avoid, and the two would disagree the first time somebody read an
     * announcement from the home card instead of the feed.
     */
    private void markRead(UUID membershipId, Notification n) {
        if (NotificationType.NEW_ANNOUNCEMENT.name().equals(n.getType())) {
            if (n.getSourceId() != null) {
                recipients.findByMembershipIdAndAnnouncementId(membershipId, n.getSourceId())
                        .ifPresent(r -> {
                            r.setReadAt(Instant.now());
                            recipients.save(r);
                        });
            }
            return;   // notification.read_at stays null forever for this type
        }
        n.setReadAt(Instant.now());
        notifications.save(n);
    }

    private boolean isRead(Notification n, Set<UUID> readAnnouncements) {
        return NotificationType.NEW_ANNOUNCEMENT.name().equals(n.getType())
                ? readAnnouncements.contains(n.getSourceId())
                : n.getReadAt() != null;
    }

    /** ONE query for every announcement row on the page. Never one lookup per row. */
    private Set<UUID> readAnnouncementIds(UUID membershipId, List<Notification> rows) {
        Set<UUID> ids = rows.stream()
                .filter(n -> NotificationType.NEW_ANNOUNCEMENT.name().equals(n.getType()))
                .map(Notification::getSourceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) return Set.of();
        return recipients.findByMembershipIdAndAnnouncementIdIn(membershipId, ids).stream()
                .filter(r -> r.getReadAt() != null)
                .map(AnnouncementRecipient::getAnnouncementId)
                .collect(Collectors.toSet());
    }

    private record Cursor(Instant createdAt, UUID id) {}

    private static String encode(Instant createdAt, UUID id) { return createdAt + "_" + id; }

    /** A malformed cursor falls back to page one rather than 500ing — it is a client-supplied
     *  opaque string, and a stale one is a normal thing to receive. */
    private static Optional<Cursor> decode(String cursor) {
        int split = cursor.lastIndexOf('_');
        if (split <= 0) return Optional.empty();
        try {
            return Optional.of(new Cursor(Instant.parse(cursor.substring(0, split)),
                                          UUID.fromString(cursor.substring(split + 1))));
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }

    private Membership me() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }
}
```

- [ ] **Step 3: Write the delegation test — the milestone's most important assertion**

```java
package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * There is ONE read marker per announcement. These two tests are the reason M29b was designed the
 * way it was: without them a second marker could be introduced and nothing would go red until a
 * real athlete read an announcement in one place and saw it unread in the other.
 */
class ReadStateDelegationTest extends AbstractIntegrationTest {

    @Autowired NotificationController feed;
    @Autowired NotificationRepository notificationsRepository;
    @Autowired com.boxhub.box.HomeController home;
    @Autowired com.boxhub.box.MyAnnouncementsController myAnnouncements;

    @Test
    void readingAnAnnouncementFromTheFeedDropsTheHomeCardBadge() {
        seedAnnouncementSentToMe();
        assertThat(home.home().announcementUnread()).isOne();

        var row = feed.list(null).rows().stream()
                .filter(r -> NotificationType.NEW_ANNOUNCEMENT.name().equals(r.type())).findFirst().orElseThrow();
        assertThat(row.read()).isFalse();
        feed.read(row.id());

        // Same column. If this fails, a second read state has been introduced.
        assertThat(home.home().announcementUnread()).isZero();
        assertThat(feed.unreadCount().count()).isZero();
    }

    @Test
    void readingAnAnnouncementFromHomeMarksTheFeedRowRead() {
        var seeded = seedAnnouncementSentToMe();

        myAnnouncements.read(seeded.announcementId());

        var row = feed.list(null).rows().stream()
                .filter(r -> NotificationType.NEW_ANNOUNCEMENT.name().equals(r.type())).findFirst().orElseThrow();
        assertThat(row.read()).isTrue();
        assertThat(feed.unreadCount().count()).isZero();
    }

    @Test
    void markAllReadClearsAnnouncementsToo() {
        seedAnnouncementSentToMe();
        seedWaitlistPromotionNotificationForMe();
        assertThat(feed.unreadCount().count()).isEqualTo(2);

        feed.readAll();

        // Announcements are not on the notification row's read_at, so a loop over notifications
        // alone would leave the bell showing 1 forever.
        assertThat(feed.unreadCount().count()).isZero();
        assertThat(home.home().announcementUnread()).isZero();
    }

    @Test
    void anAnnouncementNotificationNeverStoresItsOwnReadState() {
        seedAnnouncementSentToMe();
        var row = feed.list(null).rows().getFirst();

        feed.read(row.id());

        assertThat(notificationsRepository.findById(row.id()).orElseThrow().getReadAt())
                .as("the delegating row must stay null — a value here IS the second marker")
                .isNull();
    }
}
```

- [ ] **Step 4: Write the API test**

`NotificationApiTest` covers happy, auth-denied and cross-tenant-denied for all four endpoints, plus paging. Follow `ConversationApiTest`'s structure — read it and mirror its MockMvc setup and its token helpers.

```java
@Test
void aMemberCannotMarkAnotherMembersNotificationRead() {
    UUID theirs = seedNotificationForAnotherMember();

    mockMvc.perform(post("/api/box/notifications/" + theirs + "/read").with(csrf())
                    .headers(authFor("athlete@demo.io")))
            .andExpect(status().isNotFound());   // never 403 — it must not confirm the row exists
}

@Test
void pagingReturnsEveryRowExactlyOnce() {
    // 31 rows written at the SAME Instant, which is what emitAll does for a class cancellation.
    // Without the (createdAt, id) tiebreak in the keyset query, the page boundary loses or repeats
    // a row here and a naive test that only counts page one would never see it.
    seedNotificationsForMe(31);

    var first = feed.list(null);
    var second = feed.list(first.nextCursor());

    assertThat(first.rows()).hasSize(30);
    assertThat(second.rows()).hasSize(1);
    assertThat(second.nextCursor()).isNull();
    assertThat(Stream.concat(first.rows().stream(), second.rows().stream())
            .map(NotificationController.FeedRow::id).distinct()).hasSize(31);
}

@Test
void remindersAndMessagesNeverAppearInTheFeed() {
    seedClassStartingSoonNotificationForMe();

    assertThat(feed.list(null).rows()).isEmpty();
}
```

- [ ] **Step 5: Run**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NotificationApiTest,ReadStateDelegationTest' > /tmp/m29b-t13.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t13.txt | head
```

Expected: all green. **`AuthzConformanceTest` will now FAIL** — four unregistered routes. That failure is the design, not a broken test; Task 15 registers them, and only the orchestrator may make that edit.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/notify/NotificationController.java backend/src/main/java/com/boxhub/box/AnnouncementRecipientRepository.java backend/src/test/java/com/boxhub/notify
git commit -m "feat(m29b): the feed API, with announcement read state delegated

markRead() is the one place the delegation lives: an announcement's read state
is written to announcement_recipient and notification.read_at is left null
forever. Two tests assert it in both directions — read from the feed and the
home badge drops; read from home and the feed row shows read — because a
second marker would go unnoticed until a real athlete hit it.

Mark-all-read walks both tables. Announcements are not on the notification
row's read_at, so a loop over notifications alone would leave the bell stuck.

The cursor is optional, deliberately: a required @RequestParam makes Spring
400 before RoleGuard runs, so the authz sweep would never exercise the role
check on this route.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 14: `NotificationPrefController`

Two endpoints. The response is the *effective* state — a member has never saved a preference and must still see accurate switches.

**Files:**
- Create: `backend/src/main/java/com/boxhub/notify/NotificationPrefController.java`
- Test: `backend/src/test/java/com/boxhub/notify/NotificationPrefApiTest.java`

**Interfaces:**
- Produces: `GET /api/box/me/notification-prefs` returning `List<PrefRow>` and `PUT` taking `List<PrefUpdate>`. Task 20's preferences page consumes both.

- [ ] **Step 1: Write the controller**

```java
package com.boxhub.notify;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

/** The member's own notification preferences. Member-scoped; no id selects a person. */
@RestController
@RequestMapping("/api/box/me/notification-prefs")
public class NotificationPrefController {

    private final NotificationPrefRepository prefs;
    private final MembershipRepository memberships;

    public NotificationPrefController(NotificationPrefRepository prefs, MembershipRepository memberships) {
        this.prefs = prefs;
        this.memberships = memberships;
    }

    /**
     * The EFFECTIVE state, not the stored one. notification_pref is sparse — most members have no
     * rows at all — so returning stored rows would render every switch off for a new member and
     * make the whole page a lie. `mandatory` tells the page to render a locked control with a
     * reason rather than a switch that silently does nothing.
     */
    public record PrefRow(String type, String channel, boolean enabled, boolean mandatory) {}
    public record PrefUpdate(String type, String channel, boolean enabled) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<PrefRow> mine() {
        UUID me = me().getId();
        Map<String, Boolean> stored = prefs.findByMembershipId(me).stream()
                .collect(Collectors.toMap(p -> p.getType() + "/" + p.getChannel(),
                                          NotificationPref::isEnabled, (a, b) -> a));

        // Only the types a person can actually see. NEW_MESSAGE and CLASS_STARTING_SOON are
        // declared but deliver nothing in-app, and a switch that controls nothing is worse than
        // an absent one — they appear when M27c gives them a channel.
        return Arrays.stream(NotificationType.values())
                .filter(NotificationType::showsInFeed)
                .map(t -> new PrefRow(t.name(), NotificationChannel.IN_APP.name(),
                        t.mandatory() || stored.getOrDefault(
                                t.name() + "/" + NotificationChannel.IN_APP.name(), t.defaultOn()),
                        t.mandatory()))
                .toList();
    }

    @PutMapping
    @Transactional
    public List<PrefRow> save(@Valid @RequestBody List<PrefUpdate> updates) {
        UUID me = me().getId();
        for (PrefUpdate u : updates) {
            NotificationType type = parse(u.type());
            // A mandatory type has no switch on the page; a request to turn one off is either a
            // stale client or someone poking the API, and both deserve a refusal rather than a
            // silently ignored write that the UI would then render as success.
            if (type.mandatory()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "MANDATORY_NOTIFICATION");
            }
            if (!NotificationChannel.IN_APP.name().equals(u.channel())) {
                // PUSH and SMS exist in the enum for M27c and M32b; neither delivers yet, so a
                // stored preference for them would be a promise this build cannot keep.
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CHANNEL_NOT_AVAILABLE");
            }
            NotificationPref row = prefs
                    .findByMembershipIdAndTypeAndChannel(me, type.name(), u.channel())
                    .orElseGet(() -> {
                        NotificationPref fresh = new NotificationPref();
                        fresh.setMembershipId(me);
                        fresh.setType(type.name());
                        fresh.setChannel(u.channel());
                        return fresh;
                    });
            row.setEnabled(u.enabled());
            prefs.save(row);
        }
        return mine();
    }

    private static NotificationType parse(String type) {
        try {
            return NotificationType.valueOf(type);
        } catch (IllegalArgumentException unknown) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UNKNOWN_NOTIFICATION_TYPE");
        }
    }

    private Membership me() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }
}
```

- [ ] **Step 2: Write the tests**

```java
@Test
void aMemberWithNoStoredPreferencesSeesTheDefaults() {
    // The sparse-table trap: stored rows would render every switch off for a new member.
    var rows = controller.mine();

    assertThat(rows).hasSize(12);
    assertThat(rows).allSatisfy(r -> assertThat(r.enabled()).isTrue());
}

@Test
void savingOneTypeLeavesTheRestOnTheirDefaults() {
    controller.save(List.of(new NotificationPrefController.PrefUpdate(
            "CLASS_CANCELLED", "IN_APP", false)));

    var rows = controller.mine().stream()
            .collect(Collectors.toMap(NotificationPrefController.PrefRow::type, r -> r));
    assertThat(rows.get("CLASS_CANCELLED").enabled()).isFalse();
    assertThat(rows.get("WAITLIST_PROMOTED").enabled()).isTrue();
}

@Test
void aMandatoryTypeCannotBeSwitchedOff() {
    assertThatThrownBy(() -> controller.save(List.of(
            new NotificationPrefController.PrefUpdate("PAYMENT_FAILED", "IN_APP", false))))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("MANDATORY_NOTIFICATION");
}

@Test
void mandatoryTypesReportThemselvesSoThePageCanLockThem() {
    assertThat(controller.mine()).filteredOn(NotificationPrefController.PrefRow::mandatory)
            .extracting(NotificationPrefController.PrefRow::type)
            .containsExactlyInAnyOrder("SUBSCRIPTION_EXPIRING", "PAYMENT_FAILED", "MEMBERSHIP_BLOCKED");
}

@Test
void undeliverableChannelsAreRefused() {
    assertThatThrownBy(() -> controller.save(List.of(
            new NotificationPrefController.PrefUpdate("CLASS_CANCELLED", "PUSH", true))))
            .hasMessageContaining("CHANNEL_NOT_AVAILABLE");
}

@Test
void typesWithNoInAppDeliveryAreNotOffered() {
    // A switch that controls nothing is worse than an absent one.
    assertThat(controller.mine()).extracting(NotificationPrefController.PrefRow::type)
            .doesNotContain("NEW_MESSAGE", "CLASS_STARTING_SOON");
}
```

Plus happy / auth-denied / cross-tenant-denied through MockMvc for both endpoints, mirroring `ConversationApiTest`.

- [ ] **Step 3: Run**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='NotificationPrefApiTest' > /tmp/m29b-t14.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t14.txt | head
```

- [ ] **Step 4: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/main/java/com/boxhub/notify/NotificationPrefController.java backend/src/test/java/com/boxhub/notify/NotificationPrefApiTest.java
git commit -m "feat(m29b): per-type, per-channel notification preferences

The GET returns EFFECTIVE state, not stored rows. notification_pref is sparse
by design, so returning what is stored would render every switch off for a
member who has never saved one and make the page a lie.

A mandatory type is refused rather than silently ignored, and a channel that
cannot deliver yet is refused too — a stored PUSH preference would be a
promise this build cannot keep. Types with no in-app delivery are not offered
at all: a switch that controls nothing is worse than an absent one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 15: Register the six endpoints in `AuthzConformanceTest` — **ORCHESTRATOR ONLY**

> **Do not dispatch this.** CLAUDE.md: the orchestrator, not an executor, audits every edit to this file. The only permitted change is registering a route and seeding a real id. Never weaken an assertion, never allowlist around one, never remove a probe.

The sweep has been failing since Task 13 — six routes exist that declare no intent. **That failure is the design.**

**Files:**
- Modify: `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java`

- [ ] **Step 1: Confirm the failure names exactly the six routes**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='AuthzConformanceTest' > /tmp/m29b-t15.txt 2>&1; echo $?
grep -E "notification|MIN_ROLE|pathIds" /tmp/m29b-t15.txt | head -20
```

Expected: six unregistered routes named. If it names more or fewer, stop and read why before editing.

- [ ] **Step 2: Register the roles**

Every route is member-level — any ACTIVE member of the box, which is `ATHLETE` in this map's vocabulary (`GET /api/box/conversations` is registered the same way). Add to `MIN_ROLE`:

```java
            Map.entry("GET /api/box/notifications", "ATHLETE"),
            Map.entry("GET /api/box/notifications/unread-count", "ATHLETE"),
            Map.entry("POST /api/box/notifications/{id}/read", "ATHLETE"),
            Map.entry("POST /api/box/notifications/read-all", "ATHLETE"),
            Map.entry("GET /api/box/me/notification-prefs", "ATHLETE"),
            Map.entry("PUT /api/box/me/notification-prefs", "ATHLETE"),
```

- [ ] **Step 3: Seed a real notification id**

`POST /api/box/notifications/{id}/read` carries a path variable, and the sweep's foreign-box probe needs a **real box-A row** — a random UUID would only prove "unknown id → not 2xx", which any CRUD app satisfies. In `fixture()`, after the announcement seed, create a notification for box A's athlete and register it:

```java
        // A real box-A notification, so probe (b) is a tenancy assertion rather than a 404 check.
        // Owned by athleteMembership, because the route resolves {id} against the CALLER's
        // membership — seeded against anyone else it would 404 for box A's own admin too, and the
        // positive control (b+) would fail for a reason that has nothing to do with tenancy.
        pathIds.put("notifications", boxANotificationId.toString());
```

**Watch the segment collision.** `pathIds` is keyed by the preceding path segment, so `notifications` covers `/api/box/notifications/{id}/read`. Confirm no other route puts a different id type after a `notifications` segment.

- [ ] **Step 4: Add the PUT body**

`PUT /api/box/me/notification-prefs` takes a body; without one the probe 400s before `RoleGuard` runs and the role check is never exercised — the file's own documented trap. Add to the request-body map:

```java
                Map.entry("PUT /api/box/me/notification-prefs",
                        "[{\"type\":\"CLASS_CANCELLED\",\"channel\":\"IN_APP\",\"enabled\":false}]"),
```

- [ ] **Step 5: Run it, and the whole suite**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest='AuthzConformanceTest' > /tmp/m29b-t15b.txt 2>&1; echo $?
grep -E "Tests run|FAIL" /tmp/m29b-t15b.txt | head
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-t15-full.txt 2>&1; echo $?
grep -E "Tests run:.*Failures|BUILD" /tmp/m29b-t15-full.txt | tail -3
```

Expected: green, and `BUILD SUCCESS`. **If a probe fails, fix the route, not the sweep.**

- [ ] **Step 6: Audit your own diff before committing**

```bash
cd ~/dev/boxhub && git diff backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java
```

Read every line. It must contain **only** additions to `MIN_ROLE`, `pathIds` and the body map. Any changed assertion, any new allowlist entry, any deleted probe is a violation of the standing guarantee — revert it.

- [ ] **Step 7: Commit**

```bash
cd ~/dev/boxhub
git add backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java
git commit -m "test(m29b): register the six notification routes in the authz sweep

Additions only: MIN_ROLE entries, a real box-A notification id in pathIds, and
a body for the PUT so the probe reaches RoleGuard instead of 400ing first. No
assertion weakened, no allowlist added, no probe removed.

The seeded notification belongs to box A's athlete because the read route
resolves {id} against the caller's own membership — seeded against anyone
else, the positive control would fail for a reason unrelated to tenancy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 16: Frontend models, service and the `bell` icon

**Files:**
- Modify: `frontend/src/app/ui/icon.component.ts` — add `bell`
- Create: `frontend/src/app/features/notifications/notification.models.ts`
- Create: `frontend/src/app/features/notifications/notification.service.ts`
- Test: `frontend/src/app/features/notifications/notification.service.spec.ts`

**Interfaces:**
- Produces: `NotificationService` with `unread` (a `signal<number>`), `refreshUnread()`, `list(cursor?)`, `markRead(id)`, `markAllRead()`, `prefs()`, `savePrefs(updates)`; and the `FeedRow`, `FeedPage`, `PrefRow` types. Tasks 17, 19 and 20 consume all of them.

- [ ] **Step 1: Add the icon, copied not retyped**

`icon.component.ts`'s own rule: *"Adding an icon is three lines: the name in `ICON_NAMES`, a `@case` here with the children copied verbatim from `node_modules/lucide-static/icons/<name>.svg`. Never retype a `d` attribute."* Follow it literally:

```bash
cd ~/dev/boxhub/frontend && cat node_modules/lucide-static/icons/bell.svg
```

Add `'bell'` to `ICON_NAMES` and a `@case ('bell')` whose children are the `<path>` elements from that file, pasted exactly. **Do not hand-write the path data.**

- [ ] **Step 2: Write the models**

```typescript
/** Mirrors NotificationController's records exactly. params is per-type and rendered by
 *  notification-copy.ts, never by the server — that is what keeps every string translatable. */
export interface FeedRow {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface FeedPage {
  rows: FeedRow[];
  /** null on the last page. */
  nextCursor: string | null;
}

export interface PrefRow {
  type: string;
  channel: string;
  enabled: boolean;
  /** Rendered as a locked control with a reason, never as a switch that does nothing. */
  mandatory: boolean;
}

export interface PrefUpdate {
  type: string;
  channel: string;
  enabled: boolean;
}
```

- [ ] **Step 3: Write the service**

Mirrors `MessagingService`, deliberately — the bell and the envelope should behave identically, and a second pattern would drift.

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { FeedPage, PrefRow, PrefUpdate } from './notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);

  /** The bell's badge. Owned here, exactly as MessagingService owns the envelope's, so a caller
   *  that forgets to refresh cannot leave it stale — that is how the envelope's badge once stuck
   *  after reading a message and stayed stuck until reload. */
  readonly unread = signal(0);

  refreshUnread(): void {
    this.http.get<{ count: number }>('/api/box/notifications/unread-count').subscribe({
      next: r => this.unread.set(r.count),
      error: () => {},
    });
  }

  list(cursor?: string | null): Observable<FeedPage> {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<FeedPage>('/api/box/notifications', { params });
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/box/notifications/${id}/read`, {})
      .pipe(tap(() => this.refreshUnread()));
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>('/api/box/notifications/read-all', {})
      .pipe(tap(() => this.unread.set(0)));
  }

  prefs(): Observable<PrefRow[]> {
    return this.http.get<PrefRow[]>('/api/box/me/notification-prefs');
  }

  savePrefs(updates: PrefUpdate[]): Observable<PrefRow[]> {
    return this.http.put<PrefRow[]>('/api/box/me/notification-prefs', updates);
  }
}
```

- [ ] **Step 4: Write the spec**

```typescript
it('drops the badge to zero immediately on mark-all-read', () => {
  service.unread.set(5);
  service.markAllRead().subscribe();
  http.expectOne('/api/box/notifications/read-all').flush(null);
  // Not "eventually, on the next 60s poll" — the badge must not survive the action that cleared it.
  expect(service.unread()).toBe(0);
});

it('refreshes the badge after marking one read', () => {
  service.markRead('n1').subscribe();
  http.expectOne('/api/box/notifications/n1/read').flush(null);
  http.expectOne('/api/box/notifications/unread-count').flush({ count: 4 });
  expect(service.unread()).toBe(4);
});

it('omits the cursor param on the first page', () => {
  service.list().subscribe();
  const req = http.expectOne(r => r.url === '/api/box/notifications');
  expect(req.request.params.has('cursor')).toBeFalse();
});

it('leaves the badge alone when the count request fails', () => {
  service.unread.set(3);
  service.refreshUnread();
  http.expectOne('/api/box/notifications/unread-count').error(new ProgressEvent('offline'));
  // A failed poll must not silently render "no notifications" — that is a lie, not a fallback.
  expect(service.unread()).toBe(3);
});
```

- [ ] **Step 5: Run Karma**

```bash
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless > /tmp/m29b-t16.txt 2>&1; echo $?
tail -5 /tmp/m29b-t16.txt
```

- [ ] **Step 6: Commit**

```bash
cd ~/dev/boxhub
git add frontend/src/app/ui/icon.component.ts frontend/src/app/features/notifications
git commit -m "feat(m29b): notification service, models and the bell icon

The service mirrors MessagingService deliberately — the bell and the envelope
should behave identically, and a second pattern would drift. It owns the
unread signal so a caller that forgets to refresh cannot leave the badge
stale, which is how the envelope's badge once stuck until reload.

A failed count poll leaves the badge alone rather than rendering zero: 'no
notifications' is a lie, not a fallback.

bell is the only new icon; the other eleven types map onto names already in
ICON_NAMES.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 17: `bh-notification-bell`, the dev gallery, and the three shells

**Files:**
- Create: `frontend/src/app/features/notifications/notification-bell.component.ts`
- Test: `frontend/src/app/features/notifications/notification-bell.component.spec.ts`
- Modify: `frontend/src/app/features/athlete/athlete-shell.page.ts`
- Modify: `frontend/src/app/features/coach/coach-shell.page.ts`
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts`
- Modify: `frontend/src/app/features/dev/dev-gallery.page.ts`

**Interfaces:**
- Consumes: `NotificationService.unread`, `refreshUnread()`
- Produces: `<bh-notification-bell actions route="…" testId="…" />`, projected into `bh-shell-header`'s `[actions]` slot.

- [ ] **Step 1: Write the component**

A near-copy of `bh-messages-envelope`. That is the intent, not laziness: the two badges sit side by side, and any difference in polling, capping or aria wording would read as a bug.

```typescript
import { Component, OnInit, OnDestroy, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../ui/icon.component';
import { NotificationService } from './notification.service';

/**
 * The header bell, shared by all three shells — the sibling of bh-messages-envelope, which owns
 * messages and their own read marker. Two badges, two things: the feed never shows messages, so
 * neither badge can count what the other counts (M29b D-2).
 *
 * Projected into bh-shell-header's [actions] slot; the HOST tag carries the `actions` attribute,
 * because ng-content selects on the host and not on anything inside this component.
 */
@Component({
  selector: 'bh-notification-bell',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <a class="bell" [routerLink]="route()" [attr.data-testid]="testId()"
       [attr.aria-label]="linkAriaLabel()">
      <bh-icon name="bell" [size]="20" />
      @if (unread() > 0) {
        <span class="badge" aria-hidden="true">{{ badgeLabel() }}</span>
      }
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    /* .bell inherits its base look from shell-header's ::ng-deep .acts a — tap size, colour,
       hover, focus ring. Only the badge's positioning lives here. --bone on --surface-2, never
       --volt: the switcher's mark already spent this shell's volt budget (design law), and the
       envelope beside it is styled the same way for the same reason. */
    .bell { position: relative; }
    .badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px;
      padding: 0 4px; display: inline-flex; align-items: center; justify-content: center;
      border-radius: var(--r-full); background: var(--surface-2); border: 1px solid var(--hairline);
      color: var(--bone); font-family: var(--font-mono); font-size: var(--fs-meta);
      font-variant-numeric: tabular-nums; line-height: 1; }
  `],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  protected notifications = inject(NotificationService);

  /** Per-shell target: /athlete/notifications, /coach/notifications, /admin/notifications. */
  route = input.required<string>();
  testId = input.required<string>();

  unread = this.notifications.unread;

  // Ambient chrome, so 60s — the same cadence as the envelope beside it. The feed page polls
  // nothing; it refetches on open.
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private visHandler = () => this.onVisibilityChange();

  // Three messages, not one interpolated string. The placeholder name MUST follow its expression
  // immediately (`\${n}:count:`) — written at the end it is not parsed as a placeholder at all and
  // ships as literal text, read out verbatim by a screen reader, past both Karma and the build.
  protected linkAriaLabel = computed(() => {
    const n = this.unread();
    if (n === 0) return $localize`:@@notifications.link.aria:Notifications`;
    if (n === 1) return $localize`:@@notifications.link.aria.one:1 unread notification`;
    return $localize`:@@notifications.link.aria.many:\${n}:count: unread notifications`;
  });

  protected badgeLabel = computed(() => {
    const n = this.unread();
    return n > 99 ? '99+' : String(n);
  });

  ngOnInit() {
    this.notifications.refreshUnread();
    document.addEventListener('visibilitychange', this.visHandler);
    this.startPoll();
  }

  ngOnDestroy() {
    this.stopPoll();
    document.removeEventListener('visibilitychange', this.visHandler);
  }

  private startPoll() {
    if (this.pollHandle !== null) return;
    this.pollHandle = setInterval(() => this.notifications.refreshUnread(), 60000);
  }

  private stopPoll() {
    if (this.pollHandle !== null) { clearInterval(this.pollHandle); this.pollHandle = null; }
  }

  private onVisibilityChange() {
    if (document.visibilityState === 'visible') this.startPoll();
    else this.stopPoll();
  }
}
```

> **Backtick warning.** A stray backtick inside a component's `template:` or `styles:` comment closes the template string, and the compiler errors never point anywhere near it. If the build breaks with something inexplicable after editing this file, grep for unbalanced backticks before anything else.

- [ ] **Step 2: Write the spec**

```typescript
it('renders no badge at zero', () => { /* the badge element must be absent, not empty */ });
it('caps the badge at 99+', () => { /* 100 renders "99+" */ });
it('announces the count to screen readers', () => {
  // The badge is aria-hidden, so the count reaches assistive tech ONLY through this label.
  // Assert the literal text — a broken $localize placeholder ships as "5:count: unread…" and
  // passes every other check.
  expect(link.getAttribute('aria-label')).toBe('5 unread notifications');
});
it('stops polling when the tab is hidden', () => { /* … */ });
it('refreshes once on init', () => { /* … */ });
```

- [ ] **Step 3: Add it to the three shells**

Beside the existing envelope, before the profile button. Athlete:

```html
<bh-messages-envelope actions route="/athlete/messages" testId="athlete-messages-link" />
<bh-notification-bell actions route="/athlete/notifications" testId="athlete-notifications-link" />
```

Coach: `/coach/notifications`, `coach-notifications-link`. Admin: `/admin/notifications`, `admin-notifications-link`. Import the component in each shell's `imports` array.

- [ ] **Step 4: Add the dev-gallery section**

Every component owes seven states and the gallery IS that contract — an omitted state is indistinguishable from a forgotten one, and Karma enforces the contract. Add a `bh-notification-bell` section following the `bh-switch` section's shape, rendering: **zero (no badge)**, **one**, **many**, **99+**, **focus** (noted as hand-checkable), and **explicitly declaring** the states this component cannot have — it has no disabled, loading, error or empty state, because it is a link whose only variable is a number.

- [ ] **Step 5: Run Karma and the production build**

```bash
cd ~/dev/boxhub/frontend
env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless > /tmp/m29b-t17-karma.txt 2>&1; echo $?
tail -5 /tmp/m29b-t17-karma.txt
env -u NODE_OPTIONS npm run build > /tmp/m29b-t17-build.txt 2>&1; echo $?
grep -iE "warning|error" /tmp/m29b-t17-build.txt | head
```

Expected: Karma green, build green with **zero warnings**. `ng build` does not compile spec files, so a green build is not evidence the specs compile — Karma is.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/boxhub
git add frontend/src/app/features/notifications frontend/src/app/features/athlete/athlete-shell.page.ts frontend/src/app/features/coach/coach-shell.page.ts frontend/src/app/features/admin/admin-shell.page.ts frontend/src/app/features/dev/dev-gallery.page.ts
git commit -m "feat(m29b): the header bell, in all three shells

A near-copy of bh-messages-envelope on purpose: the two badges sit side by
side, and any difference in polling, capping or aria wording would read as a
bug. Two badges, two things — the feed never shows messages, so neither can
count what the other counts.

--bone on --surface-2, never volt: the switcher's mark already spends the
shell's budget, and the envelope beside it is styled the same way.

Dev-gallery section renders zero/one/many/99+ and declares the states this
component cannot have, so an omitted state is not mistaken for a forgotten one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 18: `notification-copy.ts` — one place that turns a type into words

**Files:**
- Create: `frontend/src/app/features/notifications/notification-copy.ts`
- Test: `frontend/src/app/features/notifications/notification-copy.spec.ts`

**Interfaces:**
- Produces: `NOTIFICATION_COPY: Record<string, NotificationCopy>` where `NotificationCopy = { icon: IconName; title: (p) => string; body: (p) => string | null }`. Task 19's feed page is its only consumer.

- [ ] **Step 1: Write the map**

Twelve entries, one per feed type. Every string is `$localize`d with an explicit `@@id`. The params come from the server frozen at emit; this file is the only thing that turns them into a sentence, which is what keeps them translatable.

```typescript
import { IconName } from '../../ui/icon.component';

export interface NotificationCopy {
  icon: IconName;
  title: (p: Record<string, string | number>) => string;
  /** null when the title says everything — an empty second line is worse than none. */
  body: (p: Record<string, string | number>) => string | null;
}

/** "Your gym" — the fallback for a system or seeded announcement, whose sentByName is legitimately
 *  absent (V30's backfill). It lives here, not in a database row, so it stays translatable. */
const ANONYMOUS_SENDER = $localize`:@@notifications.sender.anonymous:Your gym`;

export const NOTIFICATION_COPY: Record<string, NotificationCopy> = {
  WAITLIST_PROMOTED: {
    icon: 'check',
    title: p => $localize`:@@notifications.waitlistPromoted.title:You're in — ${p['className']}:className:`,
    body: () => $localize`:@@notifications.waitlistPromoted.body:A spot opened up and you took it.`,
  },
  CLASS_CANCELLED: {
    icon: 'x',
    title: p => $localize`:@@notifications.classCancelled.title:${p['className']}:className: is cancelled`,
    body: () => null,
  },
  CLASS_TIME_CHANGED: {
    icon: 'calendar',
    title: p => $localize`:@@notifications.classTimeChanged.title:${p['className']}:className: moved`,
    body: () => $localize`:@@notifications.classTimeChanged.body:Check the new start time.`,
  },
  COACH_CHANGED: {
    icon: 'user',
    title: p => $localize`:@@notifications.coachChanged.title:New coach for ${p['className']}:className:`,
    body: p => $localize`:@@notifications.coachChanged.body:${p['coachName']}:coachName: is taking this class.`,
  },
  LATE_CANCEL_UNREFUNDED: {
    icon: 'triangle-alert',
    title: () => $localize`:@@notifications.lateCancel.title:Late cancellation`,
    body: p => $localize`:@@notifications.lateCancel.body:Your entry for ${p['className']}:className: was used.`,
  },
  NO_SHOW_RECORDED: {
    icon: 'circle-alert',
    title: () => $localize`:@@notifications.noShow.title:Marked absent`,
    body: p => $localize`:@@notifications.noShow.body:You were not checked in for ${p['className']}:className:.`,
  },
  NEW_ANNOUNCEMENT: {
    icon: 'mail',
    title: p => p['sentByName']
      ? $localize`:@@notifications.announcement.titleFrom:${p['sentByName']}:sender: announced`
      : $localize`:@@notifications.announcement.title:${ANONYMOUS_SENDER}:sender: announced`,
    body: p => String(p['bodyPreview'] ?? ''),
  },
  SUBSCRIPTION_EXPIRING: {
    icon: 'credit-card',
    title: () => $localize`:@@notifications.expiring.title:Your membership is ending soon`,
    body: () => $localize`:@@notifications.expiring.body:Renew to keep booking classes.`,
  },
  PAYMENT_FAILED: {
    icon: 'triangle-alert',
    title: () => $localize`:@@notifications.paymentFailed.title:Payment didn't go through`,
    body: () => $localize`:@@notifications.paymentFailed.body:Check your payment method.`,
  },
  MEMBERSHIP_BLOCKED: {
    icon: 'lock',
    title: () => $localize`:@@notifications.blocked.title:Your membership is on hold`,
    body: () => $localize`:@@notifications.blocked.body:You can't book while it's on hold. Talk to your gym.`,
  },
  INVITE_ACCEPTED: {
    icon: 'user',
    title: p => $localize`:@@notifications.inviteAccepted.title:${p['inviteeName']}:name: joined`,
    body: () => $localize`:@@notifications.inviteAccepted.body:They accepted your invite.`,
  },
  NEW_MEMBER_JOINED: {
    icon: 'users',
    title: p => $localize`:@@notifications.memberJoined.title:${p['memberName']}:name: joined your gym`,
    body: () => null,
  },
};
```

**The `$localize` placeholder trap, again:** the placeholder name must follow its expression *immediately* — `${p['className']}:className:`. Written anywhere else it is not parsed as a placeholder and ships as literal text, past Karma and past the production build. This shipped once already, in the envelope's aria label.

Amounts and dates are **not** formatted here — the feed page runs them through the locale-aware pipes. No hand-written `€`, ever.

- [ ] **Step 2: Write the spec — the one that catches a forgotten type**

```typescript
it('has copy for every type the server can put in the feed', () => {
  // The server's feed types, hardcoded here on purpose: this list and NotificationType.
  // feedTypeNames() must be edited together, and a mismatch renders a blank row rather than
  // throwing — invisible in every other test.
  const SERVER_FEED_TYPES = [
    'WAITLIST_PROMOTED', 'CLASS_CANCELLED', 'CLASS_TIME_CHANGED', 'COACH_CHANGED',
    'LATE_CANCEL_UNREFUNDED', 'NO_SHOW_RECORDED', 'NEW_ANNOUNCEMENT', 'SUBSCRIPTION_EXPIRING',
    'PAYMENT_FAILED', 'MEMBERSHIP_BLOCKED', 'INVITE_ACCEPTED', 'NEW_MEMBER_JOINED',
  ];
  expect(Object.keys(NOTIFICATION_COPY).sort()).toEqual(SERVER_FEED_TYPES.sort());
});

it('falls back to "Your gym" for a system announcement', () => {
  // sentByName is legitimately absent for V30's backfill and seed sends.
  expect(NOTIFICATION_COPY['NEW_ANNOUNCEMENT'].title({ bodyPreview: 'x' })).toContain('Your gym');
});

it('renders no placeholder markers in any title', () => {
  // A misplaced placeholder name ships as literal ":className:" text. Assert it never appears.
  for (const [type, copy] of Object.entries(NOTIFICATION_COPY)) {
    const rendered = copy.title({ className: 'A', coachName: 'B', sentByName: 'C',
                                  inviteeName: 'D', memberName: 'E' });
    expect(rendered).withContext(type).not.toMatch(/:[a-zA-Z]+:/);
  }
});
```

- [ ] **Step 3: Run Karma, then commit**

```bash
cd ~/dev/boxhub/frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless > /tmp/m29b-t18.txt 2>&1; echo $?
tail -5 /tmp/m29b-t18.txt
cd ~/dev/boxhub && git add frontend/src/app/features/notifications && git commit -m "feat(m29b): notification copy, one translatable map

The server stores frozen params, never a rendered sentence, so this file is
the only thing that turns a type into words — which is what keeps every
string translatable and lets a deleted class still render its notification.

A spec asserts every server feed type has an entry: a mismatch renders a
blank row rather than throwing, and would be invisible in every other test.
Another asserts no title leaks a ':placeholder:' marker, the failure mode that
already shipped once in the envelope's aria label.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 19: The feed page

**A new screen. The impeccable routine applies in full**, and the orchestrator — not the executor — runs the gates: `shape → build → user sign-off on the render → audit ≥16/20 → critique ≥32/40 → fix every P0/P1 → re-run both`.

The shape is already agreed (the user chose it from four options): full page, day-grouped, unread rows carrying a bone dot and a heavier title, per-type icon, sticky "Mark all read". `harden` also applies — this screen renders real, user-supplied data, and a long class name or gym name is exactly what pushed an earlier screen into horizontal scroll at 200% zoom.

**Files:**
- Create: `frontend/src/app/features/notifications/notifications.page.ts`
- Test: `frontend/src/app/features/notifications/notifications.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — three routes

**Interfaces:**
- Consumes: `NotificationService`, `NOTIFICATION_COPY`, `bh-empty`, `bh-icon`, `bh-sheet`, `bh-button`
- Produces: routes `/{athlete,coach,admin}/notifications`.

- [ ] **Step 1: Add the routes**

In `app.routes.ts`, one child per shell, following the existing entries' shape:

```typescript
{ path: 'notifications', title: $localize`:@@route.notifications:Notifications`,
  loadComponent: () => import('./features/notifications/notifications.page').then(m => m.NotificationsPage) },
```

Add it under `athlete`, `coach` and `admin`. The component is shared; the shell it renders inside supplies the chrome.

- [ ] **Step 2: Build the page**

Requirements, each of which is a gate rather than a preference:

- **Day grouping.** `Today` / `Yesterday` / an absolute date, via the locale-aware date pipe. Never a hand-formatted date.
- **Every fetch has loading, error and empty states** (design law v2). The empty state uses `bh-empty` with the `bell` icon. The error state offers a retry that actually refetches.
- **Paging.** A "Load older" control when `nextCursor` is non-null; it disappears on the last page. Not infinite scroll — the dock owns the bottom of the viewport.
- **Unread rows** carry a `--bone` dot and a heavier title. Never colour alone: design law §11 says colour is never the only signal, so weight carries it too.
- **Tapping a row** marks it read and, if `link` is set, navigates. An announcement row (`link === null`) opens a detail sheet showing the full body — a repeat of home's agreed announcement-detail shape, not a new one.
- **"Mark all read"** in the sticky header, disabled when `unread() === 0` — and **guarded in the handler too**, because a disabled button guards one path and never the action.
- **`data-testid` on every element e2e needs:** `notifications-page`, `notification-row-<id>`, `notification-unread-<id>`, `notifications-empty`, `notifications-mark-all`, `notifications-load-more`, `notification-detail-sheet`.
- **360px first.** Nothing scrolls horizontally at 320px. Long class names ellipsize rather than widening the row.

- [ ] **Step 3: Karma, build, and the standing greps**

```bash
cd ~/dev/boxhub/frontend
env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless > /tmp/m29b-t19-karma.txt 2>&1; echo $?
tail -5 /tmp/m29b-t19-karma.txt
env -u NODE_OPTIONS npm run build > /tmp/m29b-t19-build.txt 2>&1; echo $?
grep -iE "warning|error" /tmp/m29b-t19-build.txt | head
cd ~/dev/boxhub
grep -rn "ngSubmit\|FormsModule" frontend/src/app/features/notifications; echo "form gate above must be empty"
grep -rnE "#[0-9a-fA-F]{3,8}\b" frontend/src/app/features/notifications; echo "hex gate above must be empty"
```

- [ ] **Step 4: Rebuild the image and verify the bundle — then hand the user a click path**

Never show the user a render without doing this first. A stale bundle has already had a shipped feature reported as missing.

```bash
cd ~/dev/boxhub
docker compose -f docker/docker-compose.yml up -d --build frontend > /tmp/m29b-t19-img.txt 2>&1; echo $?
docker compose -f docker/docker-compose.yml exec -T frontend sh -c "grep -rl 'notifications-page' /usr/share/nginx/html/*.js" > /tmp/m29b-t19-bundle.txt 2>&1; echo $?
cat /tmp/m29b-t19-bundle.txt
```

The testid must appear in the **served** bundle, not merely in the source. Then give the user a **click path**, not a screenshot: log in as the athlete, tap the bell in the header, and describe what should be on screen.

- [ ] **Step 5: Orchestrator runs the gates**

`audit` first (deterministic and cheap, and its findings should inform the design review), then `critique`, **both with Claude in Chrome connected** — a source-only pass is provisional, because ~36 of critique's 40 points can be earned without seeing a rendered pixel. Then `harden`. Fix every P0 and P1, then **re-run both gates**; a score measured with a P1 open is not the screen's score, and a score is never adjusted by hand.

- [ ] **Step 6: Commit**

Commit once the screen is past both gates with no open P0/P1, recording both scores in the message.

---

## Task 20: The preferences page

**The second new screen**, and the second full impeccable cycle. `clarify` also applies: this screen is mostly copy — each row has to explain what it controls without a manual.

**Files:**
- Create: `frontend/src/app/features/notifications/notification-prefs.page.ts`
- Test: `frontend/src/app/features/notifications/notification-prefs.page.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — three routes
- Modify: `frontend/src/app/features/notifications/notifications.page.ts` — a link to it

**Interfaces:**
- Consumes: `NotificationService.prefs()` / `savePrefs()`, `bh-switch`, `bh-panel`

- [ ] **Step 1: Build the page**

- **Route** `notifications/settings` under all three shells, reached from the feed header.
- **Grouped by the registry's four categories** — time-critical, conversational, money and membership, staff — each with a short heading. A flat list of twelve switches is a wall.
- **Mandatory types render locked with the reason stated in words**, e.g. *"Always on — this affects your payments."* Never a disabled switch with no explanation, and never a switch that silently does nothing.
- **Saves on change**, per row, with pending state and an inline error that preserves the previous value. There is no form and no submit button, so no `(submit)` binding is needed — but if one is ever added, it binds the native event with `novalidate`.
- **`data-testid`:** `notification-prefs-page`, `pref-switch-<TYPE>`, `pref-locked-<TYPE>`, `pref-error-<TYPE>`.
- **One primary action at most.** This screen has none — it saves on change — so nothing gets `variant="strong"`.

- [ ] **Step 2: Karma, build, greps, image rebuild, bundle check**

Same commands as Task 19 Step 3 and Step 4, with `notification-prefs-page` as the testid to grep for in the served bundle.

- [ ] **Step 3: Click path to the user, then the orchestrator runs `audit`, `critique` and `clarify`**

Fix every P0/P1, re-run both scoring gates, then commit with both scores recorded.

---

## Task 21: `e2e/tests/notifications.spec.ts`

**A screen is not verified until e2e runs on it.** Karma cannot see a dead binding: a spec that calls a handler directly tests the handler, never the wiring. This suite exists to catch the class of defect that ships past 500 green unit tests.

**Files:**
- Create: `e2e/tests/notifications.spec.ts`

**Interfaces:**
- Consumes: `e2e/tests/_support.ts`'s `login` and `runId` helpers.

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test';
import { login, runId } from './_support';

test('an announcement reaches the feed, and reading it there clears the home card too', async ({ page }) => {
  test.setTimeout(45000);
  const stamp = runId();
  const body = `Feed check ${stamp}`;

  // coach sends an announcement to everyone
  await login(page, 'coach@demo.io');
  await page.goto('/app/coach/announcements');
  // …compose and send, following messaging.spec.ts's composer interaction…

  // athlete sees the bell badge, opens the feed, and finds it
  await login(page, 'athlete@demo.io');
  const bell = page.getByTestId('athlete-notifications-link');
  await expect(bell).toBeVisible();
  await expect(bell.locator('.badge')).toBeVisible();
  await bell.click();
  await expect(page).toHaveURL(/\/athlete\/notifications/);

  const row = page.locator('[data-testid^="notification-row-"]', { hasText: body }).first();
  await expect(row).toBeVisible();
  await row.click();

  // THE assertion: one read marker. Reading from the feed must clear the home card's badge,
  // because they are the same column — not two states kept in sync by hand.
  await page.goto('/app/athlete/home');
  await expect(page.getByTestId('home-announcements-unread')).toHaveCount(0);
});

test('the bell badge clears on mark-all-read and stays cleared across a reload', async ({ page }) => {
  await login(page, 'athlete@demo.io');
  await page.getByTestId('athlete-notifications-link').click();
  await page.getByTestId('notifications-mark-all').click();

  await expect(page.locator('[data-testid="athlete-notifications-link"] .badge')).toHaveCount(0);
  await page.reload();
  // A badge that comes back after reload means the write never happened and only the signal moved.
  await expect(page.locator('[data-testid="athlete-notifications-link"] .badge')).toHaveCount(0);
});

test('turning a type off in preferences stops it appearing', async ({ page }) => {
  await login(page, 'athlete@demo.io');
  await page.goto('/app/athlete/notifications/settings');
  await expect(page.getByTestId('notification-prefs-page')).toBeVisible();

  // A mandatory type must be locked, not merely disabled — assert the explanation is on screen.
  await expect(page.getByTestId('pref-locked-PAYMENT_FAILED')).toBeVisible();

  await page.getByTestId('pref-switch-CLASS_CANCELLED').click();
  await page.reload();
  // The save must have persisted, not just flipped a signal.
  await expect(page.getByTestId('pref-switch-CLASS_CANCELLED')).toHaveAttribute('aria-checked', 'false');
});

test('the feed is empty and says so for a member with nothing', async ({ page }) => {
  // Use a member with no history rather than asserting on whatever the seeder happened to write —
  // a test whose precondition depends on seed timing is a broken test, not a caveat.
  await login(page, 'empty@demo.io');
  await page.getByTestId('athlete-notifications-link').click();
  await expect(page.getByTestId('notifications-empty')).toBeVisible();
});
```

Fill in the composer interaction from `messaging.spec.ts`, which already drives the announcements screen. If no seeded account has an empty feed, **ask rather than inventing one** — changing `multi@demo.io`'s memberships is explicitly off-limits.

- [ ] **Step 2: Run on a clean stack, twice**

`runner`, `tracking` and `tv` are non-idempotent and fail on a dirty stack for unrelated reasons, so bring it down with volumes first. Then run twice: a suite that passes once may be racing.

```bash
cd ~/dev/boxhub
docker compose -f docker/docker-compose.yml down -v > /tmp/m29b-t21-down.txt 2>&1; echo $?
docker compose -f docker/docker-compose.yml up -d --build > /tmp/m29b-t21-up.txt 2>&1; echo $?
cd e2e
env -u NODE_OPTIONS node_modules/.bin/playwright test tests/notifications.spec.ts > /tmp/m29b-t21-run1.txt 2>&1; echo "run1=$?"
env -u NODE_OPTIONS node_modules/.bin/playwright test tests/notifications.spec.ts > /tmp/m29b-t21-run2.txt 2>&1; echo "run2=$?"
grep -E "passed|failed" /tmp/m29b-t21-run1.txt /tmp/m29b-t21-run2.txt | tail
```

Expected: 4 passed, twice, at `retries: 0`.

- [ ] **Step 3: Commit**

```bash
cd ~/dev/boxhub && git add e2e/tests/notifications.spec.ts
git commit -m "test(m29b): e2e for the feed, the badge and preferences

Karma cannot see a dead binding — a spec that calls a handler directly tests
the handler and never the wiring. The load-bearing assertion is the round
trip: reading an announcement in the feed clears the home card's badge,
because they are the same column rather than two states synced by hand.

The badge tests reload the page: a badge that returns after reload means the
write never happened and only the signal moved.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JAaab8nW8uKEhrMELhhJqm"
```

---

## Task 22: Visual baselines and the full gate sweep — **ORCHESTRATOR**

A gate nobody runs is already failing. The visual suite was red for weeks in M29a because a new icon entered the set and its baseline was never regenerated — this milestone adds an icon, a gallery section and a badge to three shell headers, so it will move baselines whether or not anyone looks.

- [ ] **Step 1: Regenerate the visual baselines in the Linux container**

Never with local Playwright — you would compare against baselines your renderer never wrote.

```bash
cd ~/dev/boxhub
./e2e/visual.sh --update-snapshots > /tmp/m29b-t22-visual-update.txt 2>&1; echo $?
git status --porcelain e2e/tests/visual.spec.ts-snapshots
```

- [ ] **Step 2: Account for every changed baseline before accepting it**

Review the image diffs. Expected changes and nothing else: the three shell headers gain a bell; the dev gallery gains a bell section, which makes the page taller and shifts everything below it. **A content-identical image shifted by one pixel reads as a regression until you compare it** — that cost real time last session. Anything you cannot explain is a real change; investigate it rather than accepting it.

A verify run straight after `--update-snapshots` always passes and proves nothing. The evidence is the diff review.

- [ ] **Step 3: Run every gate and record the number**

```bash
cd ~/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m29b-gate-be.txt 2>&1; echo "backend=$?"
grep -E "Tests run:.*Failures" /tmp/m29b-gate-be.txt | tail -1

cd ~/dev/boxhub/frontend
env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless > /tmp/m29b-gate-karma.txt 2>&1; echo "karma=$?"
tail -3 /tmp/m29b-gate-karma.txt
env -u NODE_OPTIONS npm run build > /tmp/m29b-gate-build.txt 2>&1; echo "build=$?"
grep -icE "warning" /tmp/m29b-gate-build.txt

cd ~/dev/boxhub
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' > /tmp/g1.txt 2>&1; wc -l < /tmp/g1.txt
grep -rn "@Input()\|@Output()\|ChangeDetectionStrategy.Eager" frontend/src/app/ui > /tmp/g2.txt 2>&1; wc -l < /tmp/g2.txt
grep -rnE "#[0-9a-fA-F]{3,8}\b" frontend/src/app/ui frontend/src/app/features/notifications > /tmp/g3.txt 2>&1; wc -l < /tmp/g3.txt
grep -rn "ngSubmit\|FormsModule" frontend/src/app/features/notifications > /tmp/g4.txt 2>&1; wc -l < /tmp/g4.txt
```

Every grep must report `0`. The build must report zero warnings. **Do not pipe a gate into anything and read `$?`** — that has already produced a false zero here.

- [ ] **Step 4: Re-run the four §8.1 `ui/` greps from the M13c spec**

They are listed in `docs/superpowers/specs/2026-08-06-m13c-component-library-design.md` §8.1. Run them as written there; all must return zero.

- [ ] **Step 5: Update the docs that describe reality**

- `docs/NOTIFICATIONS.md` §1's milestone table: M29b is built. §4's rows for the twelve shipped events point at their real emit sites.
- `docs/ROADMAP-AT-A-GLANCE.md` line 40: mark M29b done.
- `.superpowers/sdd/progress.md`: the milestone's record.
- `.superpowers/sdd/NEXT-SESSION.md`: rewrite it for the next milestone. **There is only one** — never create a second under `docs/`.

- [ ] **Step 6: Merge and delete the branch**

```bash
cd ~/dev/boxhub
git checkout main && git merge --no-ff m29b-notifications
git push origin main
git branch -d m29b-notifications
git worktree list    # must show exactly one entry
```

Merging and deleting the branch are one step; only `main` should remain.
