# M16a — Plan Entitlement Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `plan.weekly_class_limit` + the two-value `plan.entitlement` string with eight
nullable per-plan limits (entries and cancellations × day/week/month/term), counted from a new
append-only `entitlement_usage` ledger, plus a three-flag per-box cancellation policy.

**Architecture:** Eight nullable `int` columns on `plans` (NULL = unlimited, all compose with AND).
A new `@TenantId` `entitlement_usage` table records one row per consumption event, because
`SlotRegenerationService` deletes booking rows and a `booking`-derived count would therefore change
when a coach edits the schedule. Window arithmetic and the fixed rule order live in a pure static
helper (`PlanLimits`); reads/writes live in `EntitlementLedger`; `BookingService` calls both under
its existing pessimistic session lock. `plan.entitlement` and `plan.weeklyClassLimit` are dropped as
columns but stay on the wire as derived values, exactly as M14a kept `wodType` alive.

**Tech Stack:** Spring Boot 3.5 / Java 21, Hibernate 6, Flyway, Postgres 16, JUnit 5 + AssertJ +
Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-22-m16a-entitlement-model-design.md`

---

## Global Constraints

- **`JAVA_HOME=/opt/homebrew/opt/openjdk@21`** on every backend command. The system JDK is 26.
- **cwd does NOT persist between tool calls.** Absolute paths everywhere.
- **`mvn clean test`, never bare `mvn test`,** after reverting anything.
- **Maven's `-Dtest=` separator is a comma, not a plus.**
- **Never pipe a gate through `grep`/`tail`** — in zsh `$?` after a pipe is the pipe's. Redirect to
  a file, then check.
- **Schema changes only via Flyway. Never edit an applied migration.** M16a adds **exactly one**:
  `V28__entitlement_model.sql`. Head goes V27 → V28.
- **Backend baseline measured on this branch 2026-08-22: `Tests 511, Failures 0, Errors 0,
  Skipped 0`.** It only grows.
- **BACKEND ONLY. Zero frontend files change.** Karma **419**, e2e **67 passed / 0 failed /
  0 skipped**, `e2e/visual.sh` **31 specs, zero dirty baselines** — all three MUST NOT MOVE. That
  is this milestone's own test on itself for scope leakage.
- **`AuthzConformanceTest` must not be touched.** M16a adds **no new routes**. If an executor
  believes it needs editing, that is an escalation to the orchestrator, not an edit.
- **`entitlement_usage` is `@TenantId`.** Since M21 a tenant-less read of a `@TenantId` table fails
  **CLOSED** — it returns **empty**, it does not error, and a test written under `actAsBox` stays
  green over the bug. Every ledger read in this milestone runs on a request thread with a box
  tenant. No `runAsRoot` anywhere in M16a.
- **`README.md` is edited in a separate opencode session. Do not touch it.**
- **Conventional commits.**
- **Executors never guess.** Plan-conflicts-with-reality → return the question to the orchestrator.
  Seven such conflicts were caught by executors in M13f and every one was real.
- **Negative control on every new test:** break the implementation, watch the test go red, revert.
  If you cannot name the mutation a test catches, say so instead of counting it as coverage.
- **No clock-dependent tests.** `SlotRegenerationTest` passed on 2026-08-20 and failed on CI on
  2026-08-22 with no code change between. Every fixture in this milestone that needs a day, week or
  month boundary builds its instants from a **pinned `LocalDate`** in an explicit zone, never from
  `Instant.now().plusSeconds(...)`.

---

## Decisions taken before planning (user-stated 2026-08-22, these override the spec)

These four differ from the spec text. The spec is otherwise authoritative.

1. **A waitlist join consumes an ENTRY immediately.** Spec §3.2 said the entry is written at
   promotion; the user reversed it. Consequence: **promotion writes nothing to the ledger** — the
   entry was already counted at join — so promotion can never push a member past a limit and
   `cancel()` stays a pure queue shift.
2. **Whether a waitlist cancellation spends a CANCELLATION is a per-box flag,
   `boxes.count_waitlist_cancellations`, default `false`.** A waitlist cancel always refunds the
   entry (they never held a seat, so lateness is meaningless for them).
3. **The 409 reason for a blocked booking stays the bare string `LIMIT_REACHED`.**
   `frontend/src/app/features/athlete/book.page.ts:166` switches on that exact string; changing it
   would need a frontend edit, which §1 of the spec forbids. The violated limit is returned by the
   internal check and asserted by tests, so the fixed evaluation order of spec §2.2 is still pinned;
   it reaches the wire when M14b/M17 rebuilds the screen.
4. **Late-cancel behaviour is a per-box policy, not a fixed rule.** Verified against current code:
   `BookingService.cancel` throws `PAST_CUTOFF` for **any** BOOKED booking past the cutoff, so a
   BOOKED row can never be cancelled late and spec §2.4's rule is unreachable today —
   `BookingCancellationTest:182` says so in its own comment. Two new box flags make it real and
   preserve today's behaviour by default:
   - `boxes.allow_late_cancel` (default `false`) — when false, `PAST_CUTOFF` still fires, exactly
     as today.
   - `boxes.late_cancel_refunds_entry` (default `false`) — only consulted when a late cancel is
     permitted.
   "The time considered a late cancel" is **already** `boxes.cancel_cutoff_min` (V21, PATCHable via
   `BoxController`). **No new column for it.**

**Deliberately NOT in M16a, and why:** the **no-show fee**. A fee is money — Stripe, receipts,
proration — which spec §1.1 assigns to M16. The *entitlement* consequence of a no-show is already
correct and needs no flag: a `NO_SHOW` booking was never cancelled, so its ENTRY stays unrefunded and
the class stays consumed. The fee gets one line in `docs/BACKLOG.md` under M16 (Task 8).

## Corrections to the spec, found by grepping current code before planning

Record these in `docs/HANDOFF.md` at close (Task 8). Each one changes what gets built.

- **Spec §3's justification for the ledger is narrower than stated, but still sound.**
  `SlotRegenerationService.regenerateFrom` **refuses** a range holding a `BOOKED`/`WAITLIST`/
  `CHECKED_IN`/`NO_SHOW` booking (`RANGE_HAS_BOOKINGS`). It only ever deletes **`CANCELLED`** rows.
  So regeneration cannot erase a live entry — but it **can** erase cancellation history and the
  unrefunded entry of a late cancel, both of which M16a starts counting. The ledger is still
  required; **the test in Task 6 must therefore be built on a CANCELLED booking**, or it passes
  against a `booking`-derived count and proves nothing.
- **`MigrationGrandfatherTest` migrates only to V14** (`migrateTo("13")` then `migrateTo("14")`) and
  drives its own standalone container. V28 **cannot** affect it. **Do not touch it.**
- **Three wire consumers of the dropped fields, not one:** `PlanController.PlanDto`,
  `SubscriptionController.PlanSummaryDto` (serves the athlete membership screen), and
  `DevDataSeeder`. The spec named only the first.
- **Test files calling `Plan.setEntitlement(...)` / `setWeeklyClassLimit(...)`.** The plan first
  listed five; executing Task 2 found **fourteen**, plus `BookingService` itself. Recorded here as
  measured rather than as first estimated: `MembershipSchemaTest`, `BookingEngineTest`,
  `StripeWebhookTest`, `BookingEntitlementTest` (`newPlan`, **6** call sites not 4),
  `BookingCancellationTest`, `SubscriptionServiceTest`, `InviteSubscriptionTest`,
  `SubscriptionLapseTest`, `StripeCheckoutServiceTest`, `SlotRegenerationTest`,
  `SubscriptionApiTest` (2 sites), `LogHygieneTest`, and `PlanApiTest` (JSON only — request bodies,
  which keep working through the shim). This is Moment 1 of PREFLIGHT failing in the usual way:
  the brief listed the files the change *is*, not every file that *depends* on it.
- **`resolveEntitlement` is NOT wholly redundant.** Task 2 asserted it "disappears with the
  redundancy that created it" and deleting it turned `PlanApiTest.weeklyLimitEntitlementWithoutALimitIs400`
  red. `plans.page.ts` sends `entitlement: 'WEEKLY_LIMIT'` with `weeklyClassLimit: undefined` when an
  admin picks the limited option and leaves the number blank; without the check that becomes a
  silently-unlimited plan named as if it were limited. **The half that rejects that survives as
  `PlanController.requireWeeklyLimit`, called from both `create` and `patch`.** Executor escalated
  rather than editing the test — correctly.
- **No drop-in/visitor booking path exists yet.** `Booking.setVisitorUserId` has no production
  caller; M24 builds it. The ledger is membership-only and the backfill filters
  `membership_id is not null`.

---

## File Structure

**Create**
| File | Responsibility |
|---|---|
| `backend/src/main/resources/db/migration/V28__entitlement_model.sql` | Eight plan limit columns, three box policy flags, `entitlement_usage`, data migration + backfill, drop the two old columns |
| `backend/src/main/java/com/boxhub/box/EntitlementUsage.java` | `@TenantId` ledger entity |
| `backend/src/main/java/com/boxhub/box/EntitlementUsageRepository.java` | Two reads: window count, and find-by-booking for the refund |
| `backend/src/main/java/com/boxhub/box/PlanLimits.java` | Pure static: the eight-rule table in fixed order, and window arithmetic in the box timezone. No Spring, no database |
| `backend/src/main/java/com/boxhub/box/EntitlementLedger.java` | The only place ledger rows are written or counted |
| `backend/src/test/java/com/boxhub/box/PlanLimitsTest.java` | Unit test of the window maths, pinned dates |
| `backend/src/test/java/com/boxhub/box/EntitlementLimitsTest.java` | The seven spec §5.1 integration tests |
| `backend/src/test/java/com/boxhub/box/MigrationEntitlementTest.java` | Standalone container, V27 → V28, pins the data migration and the backfill |

**Modify**
| File | Change |
|---|---|
| `backend/src/main/java/com/boxhub/box/Plan.java` | Drop `weeklyClassLimit`/`entitlement`; add the eight |
| `backend/src/main/java/com/boxhub/box/Box.java` | Add the three policy flags |
| `backend/src/main/java/com/boxhub/box/BoxController.java` | Serve + PATCH the three flags |
| `backend/src/main/java/com/boxhub/box/PlanController.java` | Eight fields on the wire + the derived `entitlement`/`weeklyClassLimit` shim; delete `resolveEntitlement` |
| `backend/src/main/java/com/boxhub/box/SubscriptionController.java:121-127` | Same shim on `PlanSummaryDto` |
| `backend/src/main/java/com/boxhub/box/BookingService.java` | Entry-limit check, cancellation-limit check, ledger writes, the `allow_late_cancel` gate |
| `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java:296,327-334` | Seed the new columns |
| `backend/src/test/java/com/boxhub/box/{MembershipSchemaTest,BookingEngineTest,StripeWebhookTest,BookingEntitlementTest}.java` | Compile fixes for the dropped setters |
| `backend/src/test/java/com/boxhub/box/{PlanApiTest,BoxSettingsTest}.java` | New fields on the wire |
| `docs/TENANCY.md`, `docs/HANDOFF.md`, `docs/BACKLOG.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/NEXT-SESSION.md`, `.superpowers/sdd/progress.md` | Close-out |

**Interfaces produced by this plan** (every later task binds to these exact names):

```java
// PlanLimits.java
public enum UsageKind { ENTRY, CANCELLATION }
public enum Period { TOTAL, MONTH, WEEK, DAY }
public record Rule(UsageKind kind, Period period, java.util.function.Function<Plan, Integer> limit, String code) {}
public static final java.util.List<Rule> ENTRY_RULES;         // TOTAL, MONTH, WEEK, DAY — in that order
public static final java.util.List<Rule> CANCELLATION_RULES;  // TOTAL, MONTH, WEEK, DAY — in that order
public static final java.time.Instant FAR_FUTURE;             // 9999-12-31T00:00:00Z
public static java.time.Instant[] window(Period p, java.time.Instant sessionStartAt, java.time.ZoneId tz, Subscription sub);

// EntitlementLedger.java  (Spring @Service)
public String firstViolated(java.util.List<PlanLimits.Rule> rules, Plan plan, Subscription sub,
                            java.time.Instant sessionStartAt, java.time.ZoneId tz, java.util.UUID membershipId);
public void recordEntry(java.util.UUID bookingId, java.util.UUID membershipId, Subscription sub, java.time.Instant sessionStartAt);
public void recordCancellation(java.util.UUID bookingId, java.util.UUID membershipId, Subscription sub, java.time.Instant sessionStartAt);
public void refundEntry(java.util.UUID bookingId);

// Plan.java — new accessors
Integer getEntriesPerDay/PerWeek/PerMonth/Total();   void setEntriesPerDay/PerWeek/PerMonth/Total(Integer);
Integer getCancellationsPerDay/PerWeek/PerMonth/Total(); void setCancellationsPerDay/PerWeek/PerMonth/Total(Integer);

// Box.java — new accessors
boolean isAllowLateCancel();            void setAllowLateCancel(boolean);
boolean isLateCancelRefundsEntry();     void setLateCancelRefundsEntry(boolean);
boolean isCountWaitlistCancellations(); void setCountWaitlistCancellations(boolean);
```

---

## Task 1 — V28: schema, data migration, backfill

**Files:**
- Create: `backend/src/main/resources/db/migration/V28__entitlement_model.sql`
- Create: `backend/src/test/java/com/boxhub/box/MigrationEntitlementTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: the `plans` / `boxes` / `entitlement_usage` shapes every later task binds to.

**Read before starting:** `backend/src/test/java/com/boxhub/box/MigrationGrandfatherTest.java` — this
task's test copies its standalone-container pattern (own `PostgreSQLContainer`, no Spring context,
Flyway driven by hand). **Do not modify `MigrationGrandfatherTest`; it stops at V14 and V28 cannot
reach it.**

- [ ] **Step 1: Write the failing migration test**

Create `backend/src/test/java/com/boxhub/box/MigrationEntitlementTest.java`:

```java
package com.boxhub.box;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Standalone container, same reasoning as MigrationGrandfatherTest: the shared singleton already has
 * V28 applied against an empty schema, so every backfill assertion against it would be a vacuous
 * 0 == 0. Here we seed genuine pre-V28 rows, then migrate and pin what V28 actually did.
 */
@Testcontainers
class MigrationEntitlementTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void v28CarriesWeeklyLimitForwardDropsTheOldColumnsAndBackfillsTheLedger() throws Exception {
        migrateTo("27");

        UUID boxId, limitedPlan, unlimitedPlan, membership, subscription, liveSession, cancelledSession;
        // Pinned, not now(): the backfill window is `least(current_period_start, now() - 35 days)`,
        // so the fixture must sit at a known offset from now rather than at a wall-clock date.
        Instant termStart = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(10, ChronoUnit.DAYS);
        Instant liveStart = termStart.plus(1, ChronoUnit.DAYS);
        Instant cancelledStart = termStart.plus(2, ChronoUnit.DAYS);

        try (Connection c = connect()) {
            boxId = insertBox(c, "v28-" + System.nanoTime());
            limitedPlan = insertPlan(c, boxId, "3x Weekly", 3, "WEEKLY_LIMIT");
            unlimitedPlan = insertPlan(c, boxId, "Unlimited", null, "UNLIMITED");
            UUID userId = insertUser(c, "v28-" + System.nanoTime() + "@t.io");
            membership = insertMembership(c, boxId, userId);
            subscription = insertSubscription(c, boxId, membership, limitedPlan, termStart,
                    termStart.plus(30, ChronoUnit.DAYS));
            liveSession = insertSession(c, boxId, liveStart);
            cancelledSession = insertSession(c, boxId, cancelledStart);
            insertBooking(c, boxId, liveSession, membership, "BOOKED");
            insertBooking(c, boxId, cancelledSession, membership, "CANCELLED");
        }

        migrateTo("28");

        try (Connection c = connect()) {
            // 1. The weekly limit is carried onto entries_per_week, value preserved.
            assertThat(intCol(c, "select entries_per_week from plans where id = '" + limitedPlan + "'"))
                    .isEqualTo(3);
            // 2. An UNLIMITED plan is all-null, which is what "unlimited" now means.
            assertThat(intCol(c, "select entries_per_week from plans where id = '" + unlimitedPlan + "'"))
                    .isNull();
            assertThat(intCol(c, "select entries_total from plans where id = '" + limitedPlan + "'"))
                    .isNull();
            // 3. Both old columns are GONE. information_schema, not a select — a select would also
            //    fail if the table were missing, and would not distinguish the two.
            assertThat(count(c, "select count(*) from information_schema.columns where table_name = 'plans' "
                    + "and column_name in ('weekly_class_limit', 'entitlement')")).isZero();
            // 4. The box policy flags exist and default to today's behaviour.
            assertThat(boolCol(c, "select allow_late_cancel from boxes where id = '" + boxId + "'")).isFalse();
            assertThat(boolCol(c, "select late_cancel_refunds_entry from boxes where id = '" + boxId + "'")).isFalse();
            assertThat(boolCol(c, "select count_waitlist_cancellations from boxes where id = '" + boxId + "'")).isFalse();
            // 5. Backfill: the LIVE booking seeded one unrefunded ENTRY carrying the session's own
            //    start_at (copied, not joined — the join target is deletable).
            assertThat(count(c, "select count(*) from entitlement_usage where membership_id = '" + membership
                    + "' and kind = 'ENTRY' and refunded = false")).isEqualTo(1);
            assertThat(instantCol(c, "select session_start_at from entitlement_usage where membership_id = '"
                    + membership + "' and kind = 'ENTRY'")).isEqualTo(liveSession(liveStart));
            // 6. The CANCELLED booking seeded NOTHING. No plan could have had a cancellation limit
            //    before V28 (the column did not exist), and a cancelled row does not record whether it
            //    was BOOKED or WAITLIST before the cancel — so its history is unknowable, not zero.
            assertThat(count(c, "select count(*) from entitlement_usage where kind = 'CANCELLATION'")).isZero();
            // 7. subscription_id and box_id are stamped; booking_id is set but carries NO FK.
            assertThat(count(c, "select count(*) from entitlement_usage where subscription_id = '" + subscription
                    + "' and box_id = '" + boxId + "' and booking_id is not null")).isEqualTo(1);
            assertThat(count(c, "select count(*) from information_schema.table_constraints tc "
                    + "join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name "
                    + "where tc.table_name = 'entitlement_usage' and tc.constraint_type = 'FOREIGN KEY' "
                    + "and k.column_name = 'booking_id'")).isZero();
        }
        // silence the unused-variable warning without weakening anything above
        assertThat(cancelledSession).isNotNull();
    }

    private Instant liveSession(Instant expected) { return expected.truncatedTo(ChronoUnit.MICROS); }

    private static void migrateTo(String version) {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .target(MigrationVersion.fromVersion(version))
                .load()
                .migrate();
    }

    private static Connection connect() throws Exception {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static int count(Connection c, String sql) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static Integer intCol(Connection c, String sql) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            rs.next();
            int v = rs.getInt(1);
            return rs.wasNull() ? null : v;
        }
    }

    private static boolean boolCol(Connection c, String sql) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getBoolean(1);
        }
    }

    private static Instant instantCol(Connection c, String sql) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getTimestamp(1).toInstant();
        }
    }

    private static UUID insertBox(Connection c, String slug) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into boxes (id, name, slug, timezone) values (?, ?, ?, 'Europe/Rome')")) {
            ps.setObject(1, id); ps.setString(2, "V28 " + slug); ps.setString(3, slug);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertPlan(Connection c, UUID boxId, String name, Integer weeklyLimit,
                                   String entitlement) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into plans (id, box_id, name, weekly_class_limit, entitlement) values (?, ?, ?, ?, ?)")) {
            ps.setObject(1, id); ps.setObject(2, boxId); ps.setString(3, name);
            if (weeklyLimit == null) ps.setNull(4, java.sql.Types.INTEGER); else ps.setInt(4, weeklyLimit);
            ps.setString(5, entitlement);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertUser(Connection c, String email) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into users (id, email, password_hash, name) values (?, ?, 'x', 'V28')")) {
            ps.setObject(1, id); ps.setString(2, email);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertMembership(Connection c, UUID boxId, UUID userId) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into memberships (id, box_id, user_id, role) values (?, ?, ?, 'ATHLETE')")) {
            ps.setObject(1, id); ps.setObject(2, boxId); ps.setObject(3, userId);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertSubscription(Connection c, UUID boxId, UUID membershipId, UUID planId,
                                           Instant start, Instant end) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into subscription (id, box_id, membership_id, plan_id, status, price_cents, "
                        + "current_period_start, current_period_end) values (?, ?, ?, ?, 'ACTIVE', 0, ?, ?)")) {
            ps.setObject(1, id); ps.setObject(2, boxId); ps.setObject(3, membershipId); ps.setObject(4, planId);
            ps.setTimestamp(5, Timestamp.from(start)); ps.setTimestamp(6, Timestamp.from(end));
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertSession(Connection c, UUID boxId, Instant startAt) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into class_sessions (id, box_id, name, start_at, duration_min, capacity) "
                        + "values (?, ?, 'WOD', ?, 60, 10)")) {
            ps.setObject(1, id); ps.setObject(2, boxId); ps.setTimestamp(3, Timestamp.from(startAt));
            ps.executeUpdate();
        }
        return id;
    }

    private static void insertBooking(Connection c, UUID boxId, UUID sessionId, UUID membershipId,
                                      String status) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "insert into bookings (id, box_id, session_id, membership_id, status) values (?, ?, ?, ?, ?)")) {
            ps.setObject(1, UUID.randomUUID()); ps.setObject(2, boxId); ps.setObject(3, sessionId);
            ps.setObject(4, membershipId); ps.setString(5, status);
            ps.executeUpdate();
        }
    }
}
```

**If any INSERT above fails on a NOT NULL column this plan did not anticipate, STOP and escalate to
the orchestrator with the exact error.** Do not invent a column value; the fixture's shape is a
claim about the schema and a wrong guess makes the test green for the wrong reason.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test -Dtest=MigrationEntitlementTest > /tmp/m16a-t1.txt 2>&1; echo "EXIT=$?"
```
Expected: FAIL. `migrateTo("28")` finds no such version, or the `entries_per_week` select errors with
`column "entries_per_week" does not exist`.

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V28__entitlement_model.sql`:

```sql
-- M16a: one weekly limit behind a two-value string becomes eight optional limits, counted from an
-- append-only ledger. NULL means unlimited; every limit that is set must pass (AND, no precedence).

alter table plans
    add column entries_per_day            int check (entries_per_day > 0),
    add column entries_per_week           int check (entries_per_week > 0),
    add column entries_per_month          int check (entries_per_month > 0),
    add column entries_total              int check (entries_total > 0),
    add column cancellations_per_day      int check (cancellations_per_day > 0),
    add column cancellations_per_week     int check (cancellations_per_week > 0),
    add column cancellations_per_month    int check (cancellations_per_month > 0),
    add column cancellations_total        int check (cancellations_total > 0);

-- V14 set entitlement = 'WEEKLY_LIMIT' exactly where weekly_class_limit is not null, so this single
-- copy covers both old values: a WEEKLY_LIMIT plan keeps its number, an UNLIMITED plan stays all-null.
update plans set entries_per_week = weekly_class_limit where weekly_class_limit is not null;

alter table plans drop column weekly_class_limit;
alter table plans drop column entitlement;

-- Per-box cancellation policy. All three default to exactly today's behaviour: a BOOKED booking
-- cannot be cancelled past cancel_cutoff_min (allow_late_cancel = false), so the other two are inert
-- until a box opts in. cancel_cutoff_min itself already exists (V21) and is the "how late is late"
-- knob -- no new column for it.
alter table boxes
    add column allow_late_cancel            boolean not null default false,
    add column late_cancel_refunds_entry    boolean not null default false,
    add column count_waitlist_cancellations boolean not null default false;

-- Consumption cannot be counted from `bookings`: SlotRegenerationService deletes the CANCELLED rows
-- in a regenerated range, which would silently erase cancellation history and the unrefunded entry of
-- a late cancel. Hence an append-only ledger that scheduling never touches.
create table entitlement_usage (
    id               uuid primary key default gen_random_uuid(),
    box_id           uuid not null references boxes (id),
    subscription_id  uuid not null references subscription (id),
    membership_id    uuid not null references memberships (id),
    -- NO foreign key, deliberately: an FK would either block the regeneration delete or cascade this
    -- row away with it, which is the exact failure this table exists to prevent. Soft reference for
    -- tracing and for the refund lookup; no count reads it.
    booking_id       uuid,
    -- Copied, not joined: the window anchor must survive the session row being deleted.
    session_start_at timestamptz not null,
    kind             text not null check (kind in ('ENTRY', 'CANCELLATION')),
    refunded         boolean not null default false,
    created_at       timestamptz not null default now()
);
create index idx_entitlement_usage_count on entitlement_usage (membership_id, kind, session_start_at);
create index idx_entitlement_usage_box on entitlement_usage (box_id);
create index idx_entitlement_usage_booking on entitlement_usage (booking_id);

-- Backfill: an athlete mid-term must not be handed a fresh allowance. This is the one moment
-- `bookings` is authoritative -- before regeneration can have deleted anything from the current term.
--
-- Bound: least(term start, 35 days ago). 35 days covers the widest rolling window (a calendar month)
-- and the full term of a monthly plan; for an annual plan current_period_start reaches further back,
-- which is exactly what `entries_total` needs.
--
-- Live statuses only. A CANCELLED row seeds nothing: no plan could have carried a cancellation limit
-- before this migration, and a cancelled booking does not record whether it was BOOKED or WAITLIST
-- before the cancel -- so its consumption history is unknowable rather than zero.
insert into entitlement_usage (box_id, subscription_id, membership_id, booking_id, session_start_at, kind, refunded)
select b.box_id, sub.id, b.membership_id, b.id, s.start_at, 'ENTRY', false
from bookings b
         join class_sessions s on s.id = b.session_id
         join subscription sub on sub.membership_id = b.membership_id and sub.status = 'ACTIVE'
where b.membership_id is not null
  and b.status in ('BOOKED', 'WAITLIST', 'CHECKED_IN', 'NO_SHOW')
  and s.start_at >= least(sub.current_period_start, now() - interval '35 days');
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test -Dtest=MigrationEntitlementTest > /tmp/m16a-t1.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`.

- [ ] **Step 5: Negative control**

Change `update plans set entries_per_week = weekly_class_limit ...` to `= null`, re-run,
**confirm assertion 1 goes red**, then revert. Then delete the `insert into entitlement_usage`
statement, re-run, **confirm assertion 5 goes red**, then revert. Re-run `mvn clean test
-Dtest=MigrationEntitlementTest` and confirm green. Report both mutations and both failures.

**Note:** the rest of the suite will not compile until Task 2. That is expected — do not attempt the
full suite at the end of this task.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V28__entitlement_model.sql backend/src/test/java/com/boxhub/box/MigrationEntitlementTest.java && git commit -m "feat(m16a): V28 — eight plan limits, a box cancellation policy, and the entitlement_usage ledger"
```

---

## Task 2 — Entities, wire compatibility, and every compile fix

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/Plan.java`
- Modify: `backend/src/main/java/com/boxhub/box/Box.java`
- Modify: `backend/src/main/java/com/boxhub/box/PlanController.java`
- Modify: `backend/src/main/java/com/boxhub/box/SubscriptionController.java:121-127`
- Modify: `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java:296,327-334`
- Modify: `backend/src/test/java/com/boxhub/box/MembershipSchemaTest.java:97`
- Modify: `backend/src/test/java/com/boxhub/box/BookingEngineTest.java:87`
- Modify: `backend/src/test/java/com/boxhub/box/StripeWebhookTest.java:320`
- Modify: `backend/src/test/java/com/boxhub/box/BookingEntitlementTest.java:85-92`
- Modify: `backend/src/test/java/com/boxhub/box/PlanApiTest.java`
- Create: `backend/src/main/java/com/boxhub/box/EntitlementUsage.java`
- Create: `backend/src/main/java/com/boxhub/box/EntitlementUsageRepository.java`

**Interfaces:**
- Consumes: the V28 schema from Task 1.
- Produces: every accessor listed in the Interfaces block above, plus
  `EntitlementUsageRepository.countInWindow(...)` and `.findByBookingIdAndKind(...)`.

**The shim is the point of this task.** `plans.page.ts` binds `entitlement` to a `<select>`, disables
the limit input on `UNLIMITED`, and renders `p.weeklyClassLimit + '/week'`. Both fields must keep
appearing in — and being accepted by — the JSON, or that screen breaks and fixing it is the frontend
scope leakage this milestone forbids. **Derive, never store.**

- [ ] **Step 1: Replace the two Plan fields with the eight**

In `Plan.java`, delete the `weeklyClassLimit` and `entitlement` fields and their four accessors, and
add:

```java
    // Eight optional limits, NULL = unlimited. They compose with AND: every limit that is set must
    // pass, with no precedence between periods. Replaced plan.weekly_class_limit + plan.entitlement
    // in V28; both of those still appear on the wire as derived values (PlanController.PlanDto).
    @Column(name = "entries_per_day") private Integer entriesPerDay;
    @Column(name = "entries_per_week") private Integer entriesPerWeek;
    @Column(name = "entries_per_month") private Integer entriesPerMonth;
    @Column(name = "entries_total") private Integer entriesTotal;
    @Column(name = "cancellations_per_day") private Integer cancellationsPerDay;
    @Column(name = "cancellations_per_week") private Integer cancellationsPerWeek;
    @Column(name = "cancellations_per_month") private Integer cancellationsPerMonth;
    @Column(name = "cancellations_total") private Integer cancellationsTotal;

    public Integer getEntriesPerDay() { return entriesPerDay; }
    public void setEntriesPerDay(Integer v) { this.entriesPerDay = v; }
    public Integer getEntriesPerWeek() { return entriesPerWeek; }
    public void setEntriesPerWeek(Integer v) { this.entriesPerWeek = v; }
    public Integer getEntriesPerMonth() { return entriesPerMonth; }
    public void setEntriesPerMonth(Integer v) { this.entriesPerMonth = v; }
    public Integer getEntriesTotal() { return entriesTotal; }
    public void setEntriesTotal(Integer v) { this.entriesTotal = v; }
    public Integer getCancellationsPerDay() { return cancellationsPerDay; }
    public void setCancellationsPerDay(Integer v) { this.cancellationsPerDay = v; }
    public Integer getCancellationsPerWeek() { return cancellationsPerWeek; }
    public void setCancellationsPerWeek(Integer v) { this.cancellationsPerWeek = v; }
    public Integer getCancellationsPerMonth() { return cancellationsPerMonth; }
    public void setCancellationsPerMonth(Integer v) { this.cancellationsPerMonth = v; }
    public Integer getCancellationsTotal() { return cancellationsTotal; }
    public void setCancellationsTotal(Integer v) { this.cancellationsTotal = v; }

    /** True when no limit at all is set — what the dropped `entitlement = 'UNLIMITED'` used to say. */
    public boolean isUnlimited() {
        return entriesPerDay == null && entriesPerWeek == null && entriesPerMonth == null && entriesTotal == null
                && cancellationsPerDay == null && cancellationsPerWeek == null
                && cancellationsPerMonth == null && cancellationsTotal == null;
    }
```

- [ ] **Step 2: Add the three Box policy flags**

In `Box.java`, after `bookingHorizonWeeks`:

```java
    // M16a cancellation policy. cancel_cutoff_min (above) says HOW LATE is late; these three say what
    // happens then. All default false = exactly the pre-M16a behaviour: a BOOKED booking simply
    // cannot be cancelled past the cutoff.
    @Column(name = "allow_late_cancel", nullable = false) private boolean allowLateCancel = false;
    @Column(name = "late_cancel_refunds_entry", nullable = false) private boolean lateCancelRefundsEntry = false;
    @Column(name = "count_waitlist_cancellations", nullable = false) private boolean countWaitlistCancellations = false;

    public boolean isAllowLateCancel() { return allowLateCancel; }
    public void setAllowLateCancel(boolean v) { this.allowLateCancel = v; }
    public boolean isLateCancelRefundsEntry() { return lateCancelRefundsEntry; }
    public void setLateCancelRefundsEntry(boolean v) { this.lateCancelRefundsEntry = v; }
    public boolean isCountWaitlistCancellations() { return countWaitlistCancellations; }
    public void setCountWaitlistCancellations(boolean v) { this.countWaitlistCancellations = v; }
```

- [ ] **Step 3: Create the ledger entity and repository**

`backend/src/main/java/com/boxhub/box/EntitlementUsage.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only consumption ledger. One row per ENTRY or CANCELLATION.
 * <p>
 * It exists because consumption cannot be counted from {@code bookings}: SlotRegenerationService
 * deletes the CANCELLED rows in a regenerated range, which would erase cancellation history and the
 * unrefunded entry of a late cancel. So {@code bookingId} carries NO foreign key and
 * {@code sessionStartAt} is copied rather than joined — either would let scheduling reach in here.
 * <p>
 * {@code @TenantId}: box-operational, the dominant read is one box counting its own members
 * (docs/TENANCY.md §8). Since M21 a tenant-less read of this table returns EMPTY rather than
 * erroring — every read in M16a runs on a request thread with a box tenant.
 */
@Entity
@Table(name = "entitlement_usage")
public class EntitlementUsage {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "subscription_id", nullable = false) private UUID subscriptionId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "booking_id") private UUID bookingId;
    @Column(name = "session_start_at", nullable = false) private Instant sessionStartAt;
    @Column(nullable = false) private String kind;
    @Column(nullable = false) private boolean refunded = false;
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(UUID v) { this.subscriptionId = v; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public UUID getBookingId() { return bookingId; }
    public void setBookingId(UUID v) { this.bookingId = v; }
    public Instant getSessionStartAt() { return sessionStartAt; }
    public void setSessionStartAt(Instant v) { this.sessionStartAt = v; }
    public String getKind() { return kind; }
    public void setKind(String v) { this.kind = v; }
    public boolean isRefunded() { return refunded; }
    public void setRefunded(boolean v) { this.refunded = v; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`backend/src/main/java/com/boxhub/box/EntitlementUsageRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EntitlementUsageRepository extends JpaRepository<EntitlementUsage, UUID> {

    /**
     * Consumption in one window. JPQL, so Hibernate's @TenantId filter applies — which is correct
     * here and load-bearing: every caller is a request thread acting inside one box, and a count that
     * crossed boxes would let a member's other box eat this box's allowance.
     * <p>
     * `refunded = false` also covers CANCELLATION rows, which are never refunded — one query, both kinds.
     */
    @Query("""
            select count(u) from EntitlementUsage u
            where u.membershipId = :mid and u.kind = :kind and u.refunded = false
              and u.sessionStartAt >= :from and u.sessionStartAt < :to
            """)
    long countInWindow(@Param("mid") UUID membershipId, @Param("kind") String kind,
                       @Param("from") Instant from, @Param("to") Instant to);

    /** The refund lookup. booking_id has no FK, but it is still the handle on the row to flip. */
    Optional<EntitlementUsage> findByBookingIdAndKind(UUID bookingId, String kind);
}
```

- [ ] **Step 4: Rewrite `PlanController` — eight fields plus the derived shim**

Replace the `PlanDto` record, the two request records and `resolveEntitlement` with:

```java
    /**
     * `entitlement` and `weeklyClassLimit` are DERIVED, not stored — V28 dropped both columns.
     * They stay on the wire because frontend/src/app/features/admin/plans.page.ts binds them
     * (a select, a disabled-when-UNLIMITED input, and "N/week" in the list), exactly as M14a kept
     * `wodType` alive as `timingPreset ?? macro` after its column was gone. The shim is deleted by
     * whichever milestone rebuilds the plan admin screen (M14b or M17) — recorded in docs/HANDOFF.md.
     */
    public record PlanDto(UUID id, String name, int durationDays, Integer weeklyClassLimit, boolean archived,
                          int priceCents, String currency, String entitlement,
                          Integer entriesPerDay, Integer entriesPerWeek, Integer entriesPerMonth, Integer entriesTotal,
                          Integer cancellationsPerDay, Integer cancellationsPerWeek,
                          Integer cancellationsPerMonth, Integer cancellationsTotal) {
        static PlanDto of(Plan p) {
            return new PlanDto(p.getId(), p.getName(), p.getDurationDays(), p.getEntriesPerWeek(), p.isArchived(),
                    p.getPriceCents(), p.getCurrency(), p.isUnlimited() ? "UNLIMITED" : "WEEKLY_LIMIT",
                    p.getEntriesPerDay(), p.getEntriesPerWeek(), p.getEntriesPerMonth(), p.getEntriesTotal(),
                    p.getCancellationsPerDay(), p.getCancellationsPerWeek(),
                    p.getCancellationsPerMonth(), p.getCancellationsTotal());
        }
    }

    // weeklyClassLimit is accepted as an alias for entriesPerWeek. `entitlement` is accepted and
    // ignored: it said nothing the nullability of the eight limits does not now say directly, and
    // rejecting it would break the screen that still sends it.
    record CreatePlanRequest(@NotBlank String name, @Min(1) int durationDays, @Min(1) Integer weeklyClassLimit,
                             @Min(0) Integer priceCents, String currency, String entitlement,
                             @Min(1) Integer entriesPerDay, @Min(1) Integer entriesPerWeek,
                             @Min(1) Integer entriesPerMonth, @Min(1) Integer entriesTotal,
                             @Min(1) Integer cancellationsPerDay, @Min(1) Integer cancellationsPerWeek,
                             @Min(1) Integer cancellationsPerMonth, @Min(1) Integer cancellationsTotal) {}

    record PatchPlanRequest(String name, @Min(1) Integer durationDays, @Min(1) Integer weeklyClassLimit,
                            Boolean archived, @Min(0) Integer priceCents, String currency, String entitlement,
                            @Min(1) Integer entriesPerDay, @Min(1) Integer entriesPerWeek,
                            @Min(1) Integer entriesPerMonth, @Min(1) Integer entriesTotal,
                            @Min(1) Integer cancellationsPerDay, @Min(1) Integer cancellationsPerWeek,
                            @Min(1) Integer cancellationsPerMonth, @Min(1) Integer cancellationsTotal) {}
```

`create` becomes:

```java
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlanDto create(@Valid @RequestBody CreatePlanRequest req) {
        RoleGuard.requireBoxAdmin();
        Plan p = new Plan();
        p.setName(req.name().trim());
        p.setDurationDays(req.durationDays());
        p.setPriceCents(req.priceCents() != null ? req.priceCents() : 0);
        p.setCurrency(req.currency() != null ? req.currency() : "eur");
        // "UNLIMITED" explicitly clears the weekly alias: plans.page.ts still posts a stale
        // weeklyClassLimit alongside entitlement='UNLIMITED' when the admin flips the select back.
        boolean explicitlyUnlimited = "UNLIMITED".equals(req.entitlement());
        p.setEntriesPerWeek(explicitlyUnlimited ? req.entriesPerWeek()
                : (req.entriesPerWeek() != null ? req.entriesPerWeek() : req.weeklyClassLimit()));
        p.setEntriesPerDay(req.entriesPerDay());
        p.setEntriesPerMonth(req.entriesPerMonth());
        p.setEntriesTotal(req.entriesTotal());
        p.setCancellationsPerDay(req.cancellationsPerDay());
        p.setCancellationsPerWeek(req.cancellationsPerWeek());
        p.setCancellationsPerMonth(req.cancellationsPerMonth());
        p.setCancellationsTotal(req.cancellationsTotal());
        try {
            return PlanDto.of(plans.saveAndFlush(p));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan name already exists");
        }
    }
```

`patch` becomes:

```java
    @PatchMapping("/{id}")
    public PlanDto patch(@PathVariable UUID id, @Valid @RequestBody PatchPlanRequest req) {
        RoleGuard.requireBoxAdmin();
        Plan p = plans.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign ids look absent
        if (req.name() != null) p.setName(req.name().trim());
        if (req.durationDays() != null) p.setDurationDays(req.durationDays());
        if (req.archived() != null) p.setArchived(req.archived());
        if (req.priceCents() != null) p.setPriceCents(req.priceCents());
        if (req.currency() != null) p.setCurrency(req.currency());
        // Same alias rule as create(): an explicit UNLIMITED clears every entry limit, which is what
        // the old `entitlement` select meant when an admin switched a limited plan back to unlimited.
        if ("UNLIMITED".equals(req.entitlement())) {
            p.setEntriesPerDay(null); p.setEntriesPerWeek(null);
            p.setEntriesPerMonth(null); p.setEntriesTotal(null);
        } else if (req.weeklyClassLimit() != null) {
            p.setEntriesPerWeek(req.weeklyClassLimit());
        }
        if (req.entriesPerDay() != null) p.setEntriesPerDay(req.entriesPerDay());
        if (req.entriesPerWeek() != null) p.setEntriesPerWeek(req.entriesPerWeek());
        if (req.entriesPerMonth() != null) p.setEntriesPerMonth(req.entriesPerMonth());
        if (req.entriesTotal() != null) p.setEntriesTotal(req.entriesTotal());
        if (req.cancellationsPerDay() != null) p.setCancellationsPerDay(req.cancellationsPerDay());
        if (req.cancellationsPerWeek() != null) p.setCancellationsPerWeek(req.cancellationsPerWeek());
        if (req.cancellationsPerMonth() != null) p.setCancellationsPerMonth(req.cancellationsPerMonth());
        if (req.cancellationsTotal() != null) p.setCancellationsTotal(req.cancellationsTotal());
        try {
            return PlanDto.of(plans.saveAndFlush(p));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan name already exists");
        }
    }
```

Delete the now-unused imports if `ResponseStatusException` or `HttpStatus` become unreferenced —
they do not, both are still used above.

- [ ] **Step 5: Same shim on `SubscriptionController.PlanSummaryDto`**

Replace lines 121-127 with:

```java
    // entitlement/weeklyClassLimit are derived, same shim and same reason as PlanController.PlanDto:
    // frontend/src/app/features/athlete/membership.service.ts:12 still types both.
    record PlanSummaryDto(UUID id, String name, int priceCents, String currency, String entitlement,
                           Integer weeklyClassLimit, int durationDays) {
        static PlanSummaryDto of(Plan p) {
            return new PlanSummaryDto(p.getId(), p.getName(), p.getPriceCents(), p.getCurrency(),
                    p.isUnlimited() ? "UNLIMITED" : "WEEKLY_LIMIT", p.getEntriesPerWeek(), p.getDurationDays());
        }
    }
```

- [ ] **Step 6: Fix the five callers that no longer compile**

- `SubscriptionService.comp()` — delete the `p.setEntitlement("UNLIMITED");` line. A comp plan with
  no limits set **is** unlimited now.
- `DevDataSeeder.plan(...)` — change the signature to
  `private Plan plan(String name, int durationDays, Integer entriesPerWeek, int priceCents, String currency)`,
  drop the `entitlement` parameter and the `setEntitlement` call, replace `p.setWeeklyClassLimit(...)`
  with `p.setEntriesPerWeek(entriesPerWeek)`, and update **both** call sites at line ~296
  (`plan("3x Weekly", 30, 3, 5900, "eur")` and its unlimited sibling — grep `plan(` in that file for
  the full list; do not assume there are exactly two).
- `MembershipSchemaTest:97` — `p.setEntitlement("WEEKLY_LIMIT");` → delete; ensure the fixture sets
  `p.setEntriesPerWeek(...)` if it also set a weekly limit.
- `BookingEngineTest:87` — `p.setEntitlement(weeklyLimit != null ? "WEEKLY_LIMIT" : "UNLIMITED");` →
  delete the line; the neighbouring `setWeeklyClassLimit(weeklyLimit)` becomes
  `setEntriesPerWeek(weeklyLimit)`.
- `StripeWebhookTest:320` — `planA.setEntitlement("WEEKLY_LIMIT");` → delete; if the fixture's intent
  was "this plan has a limit", add `planA.setEntriesPerWeek(3);`. **Open the file and read the
  surrounding assertions before choosing** — if nothing downstream depends on the plan being limited,
  just delete the line.
- `BookingEntitlementTest:85-92` — replace the `newPlan(String entitlement, Integer weeklyLimit)`
  helper with `newPlan(Integer entriesPerWeek)` and update its four call sites; `newPlan("UNLIMITED",
  null)` becomes `newPlan(null)`, `newPlan("WEEKLY_LIMIT", 1)` becomes `newPlan(1)`.

- [ ] **Step 7: Extend `PlanApiTest` for the new wire**

Add to `backend/src/test/java/com/boxhub/box/PlanApiTest.java` (keep every existing test — they pin
the shim and must stay green unchanged):

```java
    @Test
    void createAcceptsTheEightLimitsAndDerivesTheLegacyEntitlementFields() throws Exception {
        mvc.perform(post("/api/box/plans").headers(adminHeaders()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Punch Card\",\"durationDays\":30,\"entriesTotal\":10}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entriesTotal").value(10))
                .andExpect(jsonPath("$.entriesPerWeek").doesNotExist())
                // A punch card has a limit, so the derived legacy field must not claim UNLIMITED.
                .andExpect(jsonPath("$.entitlement").value("WEEKLY_LIMIT"))
                .andExpect(jsonPath("$.weeklyClassLimit").doesNotExist());
    }

    @Test
    void weeklyClassLimitStillMapsOntoEntriesPerWeekForTheUnrebuiltAdminScreen() throws Exception {
        mvc.perform(post("/api/box/plans").headers(adminHeaders()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Legacy Three\",\"durationDays\":30,\"weeklyClassLimit\":3,"
                                + "\"entitlement\":\"WEEKLY_LIMIT\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entriesPerWeek").value(3))
                .andExpect(jsonPath("$.weeklyClassLimit").value(3));
    }
```

**`adminHeaders()` is a placeholder for whatever this class already uses to authenticate an admin
call — open `PlanApiTest` and copy its existing idiom exactly.** Do not invent a helper.

- [ ] **Step 8: Compile and run the full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test > /tmp/m16a-t2.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`. Count with:
```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && python3 -c "
import glob,re
t=f=e=s=0
for p in glob.glob('target/surefire-reports/*.txt'):
    m=re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)',open(p).read())
    if m: t+=int(m[1]);f+=int(m[2]);e+=int(m[3]);s+=int(m[4])
print(f'Tests {t} Failures {f} Errors {e} Skipped {s}')"
```
Expected: **`Tests 514 Failures 0 Errors 0 Skipped 0`** (511 + 1 from Task 1 + 2 from Step 7). If the
number differs, report the actual number and which class moved — do not adjust the expectation
silently.

- [ ] **Step 9: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(m16a): eight plan limits and box cancellation flags on the entities, with entitlement/weeklyClassLimit derived on the wire"
```

---

## Task 3 — `PlanLimits`: the rule table and the window arithmetic

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/PlanLimits.java`
- Create: `backend/src/test/java/com/boxhub/box/PlanLimitsTest.java`

**Interfaces:**
- Consumes: `Plan`'s eight accessors and `Subscription`'s period accessors (Task 2).
- Produces: `PlanLimits.UsageKind`, `.Period`, `.Rule`, `.ENTRY_RULES`, `.CANCELLATION_RULES`,
  `.FAR_FUTURE`, `.window(...)` — bound by Tasks 4 and 6.

**This class has no Spring and no database, so its test is a plain unit test with pinned dates.** That
is the whole point: window arithmetic is where a clock-dependent test would be a coin flip.

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/box/PlanLimitsTest.java`:

```java
package com.boxhub.box;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure window arithmetic, pinned to explicit dates. Nothing here reads the clock — a calendar test
 * that is green most days is a coin flip, not coverage (SlotRegenerationTest, 2026-08-22).
 *
 * Europe/Rome throughout, and 2026-03-29 is deliberately DST-transition day in that zone: the local
 * day is 23 hours long, which is exactly the case a naive `plus(24h)` gets wrong.
 */
class PlanLimitsTest {

    private static final ZoneId ROME = ZoneId.of("Europe/Rome");

    private static Instant at(String isoLocalDate, int hour) {
        return LocalDate.parse(isoLocalDate).atStartOfDay(ROME).plusHours(hour).toInstant();
    }

    private static Subscription sub(Instant start, Instant end) {
        Subscription s = new Subscription();
        s.setCurrentPeriodStart(start);
        s.setCurrentPeriodEnd(end);
        return s;
    }

    @Test
    void dayWindowIsMidnightToMidnightInTheBoxTimezone() {
        Instant[] w = PlanLimits.window(PlanLimits.Period.DAY, at("2026-08-12", 18), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-12", 0));
        assertThat(w[1]).isEqualTo(at("2026-08-13", 0));
    }

    @Test
    void dayWindowSurvivesTheDstTransitionAsTwentyThreeHours() {
        Instant[] w = PlanLimits.window(PlanLimits.Period.DAY, at("2026-03-29", 12), ROME, sub(null, null));
        assertThat(w[1].getEpochSecond() - w[0].getEpochSecond()).isEqualTo(23 * 3600L);
    }

    @Test
    void weekWindowRunsMondayToMonday() {
        // 2026-08-12 is a Wednesday; its week starts Monday 2026-08-10.
        Instant[] w = PlanLimits.window(PlanLimits.Period.WEEK, at("2026-08-12", 7), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-10", 0));
        assertThat(w[1]).isEqualTo(at("2026-08-17", 0));
    }

    @Test
    void weekWindowOfASundayIsThatSundaysWeekNotTheNextOne() {
        // 2026-08-16 is a Sunday. previousOrSame(MONDAY) must reach BACK to the 10th, not forward.
        Instant[] w = PlanLimits.window(PlanLimits.Period.WEEK, at("2026-08-16", 23), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-10", 0));
        assertThat(w[1]).isEqualTo(at("2026-08-17", 0));
    }

    @Test
    void monthWindowIsTheFirstToTheFirst() {
        Instant[] w = PlanLimits.window(PlanLimits.Period.MONTH, at("2026-08-12", 7), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-01", 0));
        assertThat(w[1]).isEqualTo(at("2026-09-01", 0));
    }

    @Test
    void totalWindowIsTheSubscriptionTermNotTheCalendar() {
        Instant start = at("2026-08-01", 9);
        Instant end = at("2026-08-31", 9);
        Instant[] w = PlanLimits.window(PlanLimits.Period.TOTAL, at("2026-08-12", 7), ROME, sub(start, end));
        assertThat(w[0]).isEqualTo(start);
        assertThat(w[1]).isEqualTo(end);
    }

    @Test
    void totalWindowOfAGrandfatheredNullEndSubscriptionNeverCloses() {
        Instant start = at("2026-08-01", 9);
        Instant[] w = PlanLimits.window(PlanLimits.Period.TOTAL, at("2026-08-12", 7), ROME, sub(start, null));
        assertThat(w[1]).isEqualTo(PlanLimits.FAR_FUTURE);
    }

    @Test
    void entryRulesAreTotalThenMonthThenWeekThenDay() {
        assertThat(PlanLimits.ENTRY_RULES).extracting(PlanLimits.Rule::period)
                .containsExactly(PlanLimits.Period.TOTAL, PlanLimits.Period.MONTH,
                        PlanLimits.Period.WEEK, PlanLimits.Period.DAY);
        assertThat(PlanLimits.ENTRY_RULES).allMatch(r -> r.kind() == PlanLimits.UsageKind.ENTRY);
        assertThat(PlanLimits.ENTRY_RULES).extracting(PlanLimits.Rule::code)
                .containsExactly("ENTRIES_TOTAL", "ENTRIES_PER_MONTH", "ENTRIES_PER_WEEK", "ENTRIES_PER_DAY");
    }

    @Test
    void cancellationRulesMirrorThemAndReadTheCancellationColumns() {
        Plan p = new Plan();
        p.setCancellationsPerDay(1);
        p.setCancellationsPerWeek(2);
        p.setCancellationsPerMonth(3);
        p.setCancellationsTotal(4);
        assertThat(PlanLimits.CANCELLATION_RULES).extracting(r -> r.limit().apply(p))
                .containsExactly(4, 3, 2, 1);
        assertThat(PlanLimits.CANCELLATION_RULES).allMatch(r -> r.kind() == PlanLimits.UsageKind.CANCELLATION);
    }

    @Test
    void entryRulesReadTheEntryColumns() {
        Plan p = new Plan();
        p.setEntriesPerDay(1);
        p.setEntriesPerWeek(2);
        p.setEntriesPerMonth(3);
        p.setEntriesTotal(4);
        assertThat(PlanLimits.ENTRY_RULES).extracting(r -> r.limit().apply(p)).containsExactly(4, 3, 2, 1);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test -Dtest=PlanLimitsTest > /tmp/m16a-t3.txt 2>&1; echo "EXIT=$?"
```
Expected: FAIL — compilation error, `PlanLimits` does not exist.

- [ ] **Step 3: Write `PlanLimits`**

```java
package com.boxhub.box;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.function.Function;

/**
 * The eight limits, their evaluation order, and the window each one is counted over. Pure: no Spring,
 * no database, no clock. Everything it needs is passed in.
 *
 * Two things this class encodes, both from the spec:
 *
 * 1. Limits compose with AND. Every limit that is set must pass; there is no precedence between
 *    periods and no "tightest wins". The fixed TOTAL -> MONTH -> WEEK -> DAY order exists only so the
 *    athlete is told WHICH rule stopped them; the outcome is identical whichever order runs.
 *
 * 2. Every window is anchored to the SESSION BEING BOOKED, not to now(). Booking next Tuesday counts
 *    against next Tuesday's day and week. Anchoring to now() would let an athlete drain the wrong
 *    week by booking far ahead, and would make the counts disagree with what the calendar shows.
 */
public final class PlanLimits {

    private PlanLimits() {}

    public enum UsageKind { ENTRY, CANCELLATION }

    public enum Period { TOTAL, MONTH, WEEK, DAY }

    /** A subscription with no end (grandfathered or comped) has a term that never closes. Not
     *  Instant.MAX — that overflows a Postgres timestamptz on the way into the query. */
    public static final Instant FAR_FUTURE = Instant.parse("9999-12-31T00:00:00Z");

    public record Rule(UsageKind kind, Period period, Function<Plan, Integer> limit, String code) {}

    public static final List<Rule> ENTRY_RULES = List.of(
            new Rule(UsageKind.ENTRY, Period.TOTAL, Plan::getEntriesTotal, "ENTRIES_TOTAL"),
            new Rule(UsageKind.ENTRY, Period.MONTH, Plan::getEntriesPerMonth, "ENTRIES_PER_MONTH"),
            new Rule(UsageKind.ENTRY, Period.WEEK, Plan::getEntriesPerWeek, "ENTRIES_PER_WEEK"),
            new Rule(UsageKind.ENTRY, Period.DAY, Plan::getEntriesPerDay, "ENTRIES_PER_DAY"));

    public static final List<Rule> CANCELLATION_RULES = List.of(
            new Rule(UsageKind.CANCELLATION, Period.TOTAL, Plan::getCancellationsTotal, "CANCELLATIONS_TOTAL"),
            new Rule(UsageKind.CANCELLATION, Period.MONTH, Plan::getCancellationsPerMonth, "CANCELLATIONS_PER_MONTH"),
            new Rule(UsageKind.CANCELLATION, Period.WEEK, Plan::getCancellationsPerWeek, "CANCELLATIONS_PER_WEEK"),
            new Rule(UsageKind.CANCELLATION, Period.DAY, Plan::getCancellationsPerDay, "CANCELLATIONS_PER_DAY"));

    /** Half-open [from, to) in the box's timezone, anchored to the session's own start. */
    public static Instant[] window(Period period, Instant sessionStartAt, ZoneId tz, Subscription sub) {
        LocalDate date = sessionStartAt.atZone(tz).toLocalDate();
        return switch (period) {
            case DAY -> range(date, date.plusDays(1), tz);
            case WEEK -> {
                LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                yield range(monday, monday.plusWeeks(1), tz);
            }
            case MONTH -> {
                LocalDate first = date.withDayOfMonth(1);
                yield range(first, first.plusMonths(1), tz);
            }
            // The term, not the calendar: a monthly subscription's total resets every month and an
            // annual one's every year, with no new date arithmetic and nothing for an admin to reset.
            case TOTAL -> new Instant[]{
                    sub.getCurrentPeriodStart(),
                    sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd() : FAR_FUTURE};
        };
    }

    // atStartOfDay(zone), not atStartOfDay().atZone(...): on a DST-transition day the local day is 23
    // or 25 hours long, and only the zoned form gets that right.
    private static Instant[] range(LocalDate from, LocalDate to, ZoneId tz) {
        return new Instant[]{from.atStartOfDay(tz).toInstant(), to.atStartOfDay(tz).toInstant()};
    }
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test -Dtest=PlanLimitsTest > /tmp/m16a-t3.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`, 10 tests.

- [ ] **Step 5: Negative control**

Change `previousOrSame(DayOfWeek.MONDAY)` to `nextOrSame(DayOfWeek.MONDAY)`, re-run, confirm
`weekWindowOfASundayIsThatSundaysWeekNotTheNextOne` goes red, revert. Then change `range(...)`'s
`from.atStartOfDay(tz)` to `from.atStartOfDay().toInstant(java.time.ZoneOffset.UTC)`, re-run, confirm
`dayWindowIsMidnightToMidnightInTheBoxTimezone` goes red, revert. `mvn clean test
-Dtest=PlanLimitsTest` green afterwards. Report both mutations.

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add backend/src/main/java/com/boxhub/box/PlanLimits.java backend/src/test/java/com/boxhub/box/PlanLimitsTest.java && git commit -m "feat(m16a): PlanLimits — the eight-rule table and box-timezone window arithmetic"
```

---

## Task 4 — `EntitlementLedger` + the booking engine (ORCHESTRATOR IMPLEMENTS)

> **This task is NOT dispatched to an executor.** `BookingService` is the booking engine, it runs
> under a pessimistic lock on the session row, and a wrong diff there oversells a class. CLAUDE.md's
> working agreement reserves exactly this class of work for the orchestrator.

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/EntitlementLedger.java`
- Modify: `backend/src/main/java/com/boxhub/box/BookingService.java`

**Interfaces:**
- Consumes: `PlanLimits` (Task 3), `EntitlementUsageRepository` (Task 2).
- Produces: the four `EntitlementLedger` methods, and `BookingService`'s changed behaviour, which
  Task 6 tests.

- [ ] **Step 1: Write `EntitlementLedger`**

```java
package com.boxhub.box;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * The only place entitlement_usage rows are written or counted.
 *
 * Every write here runs INSIDE the caller's transaction (no REQUIRES_NEW), so a rolled-back booking
 * cannot leave a consumed entry behind — the same rule this project already applies to audit rows.
 */
@Service
public class EntitlementLedger {

    private final EntitlementUsageRepository usage;

    public EntitlementLedger(EntitlementUsageRepository usage) {
        this.usage = usage;
    }

    /**
     * The first rule in {@code rules} whose limit is set AND already met, or null if every set limit
     * has room. Rules arrive in TOTAL -> MONTH -> WEEK -> DAY order so the code identifies which rule
     * stopped the member; the pass/fail outcome is order-independent because the limits compose with AND.
     */
    public String firstViolated(List<PlanLimits.Rule> rules, Plan plan, Subscription sub,
                                Instant sessionStartAt, ZoneId tz, UUID membershipId) {
        for (PlanLimits.Rule rule : rules) {
            Integer limit = rule.limit().apply(plan);
            if (limit == null) continue; // NULL means unlimited
            Instant[] w = PlanLimits.window(rule.period(), sessionStartAt, tz, sub);
            if (usage.countInWindow(membershipId, rule.kind().name(), w[0], w[1]) >= limit) return rule.code();
        }
        return null;
    }

    @Transactional
    public void recordEntry(UUID bookingId, UUID membershipId, Subscription sub, Instant sessionStartAt) {
        insert(bookingId, membershipId, sub, sessionStartAt, PlanLimits.UsageKind.ENTRY);
    }

    @Transactional
    public void recordCancellation(UUID bookingId, UUID membershipId, Subscription sub, Instant sessionStartAt) {
        insert(bookingId, membershipId, sub, sessionStartAt, PlanLimits.UsageKind.CANCELLATION);
    }

    /**
     * Flips this booking's ENTRY row to refunded so it stops counting. Append-only in the sense that
     * matters — no row is ever deleted, and the CANCELLATION row that accompanies a refund is a new
     * row, not an edit.
     *
     * Silently does nothing when there is no ENTRY row: a booking made before V28 and outside the
     * backfill's 35-day floor has none, and refusing to let that member cancel would be worse than
     * letting one stale entry go uncounted.
     */
    @Transactional
    public void refundEntry(UUID bookingId) {
        usage.findByBookingIdAndKind(bookingId, PlanLimits.UsageKind.ENTRY.name()).ifPresent(row -> {
            row.setRefunded(true);
            usage.save(row);
        });
    }

    private void insert(UUID bookingId, UUID membershipId, Subscription sub, Instant sessionStartAt,
                        PlanLimits.UsageKind kind) {
        EntitlementUsage u = new EntitlementUsage();
        u.setSubscriptionId(sub.getId());
        u.setMembershipId(membershipId);
        u.setBookingId(bookingId);
        u.setSessionStartAt(sessionStartAt);
        u.setKind(kind.name());
        usage.save(u);
    }
}
```

- [ ] **Step 2: Rewrite `BookingService.book`'s entitlement gate and add the ledger write**

Replace the `entitlementBlocked(...)` private method with:

```java
    /**
     * Entry limits, all four of them, composed with AND. Returns the code of the first violated rule
     * or null. Replaces the single weekly check: `plan.entitlement`/`weekly_class_limit` were dropped
     * by V28 and "is there a limit" is now said by the nullability of the eight columns.
     */
    private String entryLimitViolated(ClassSession session, Box box, UUID membershipId, Subscription active) {
        Plan plan = plans.findById(active.getPlanId()).orElseThrow();
        return ledger.firstViolated(PlanLimits.ENTRY_RULES, plan, active,
                session.getStartAt(), ZoneId.of(box.getTimezone()), membershipId);
    }
```

and change `book(...)` so it resolves the subscription once, checks, then records:

```java
        Subscription active = subscriptions.activeFor(membershipId)
                .orElseThrow(() -> conflict("NO_ACTIVE_SUBSCRIPTION"));
        // ponytail: the reason string stays the bare "LIMIT_REACHED" that book.page.ts:166 switches
        // on. entryLimitViolated() names WHICH limit bound (spec §2.2) and the tests assert it; it
        // reaches the wire when M14b/M17 rebuilds the athlete booking screen and can render it.
        if (entryLimitViolated(session, box, membershipId, active) != null) throw conflict("LIMIT_REACHED");
```

and after `bookings.save(b)`:

```java
        Booking saved = bookings.save(b);
        // A WAITLIST join consumes an ENTRY too (user decision, 2026-08-22, overriding spec §3.2).
        // Promotion therefore writes NOTHING — the entry was counted at join — which is what makes it
        // impossible for a promotion to push anyone past a limit, and keeps cancel() a pure queue shift.
        ledger.recordEntry(saved.getId(), membershipId, active, session.getStartAt());
        return saved;
```

Add `EntitlementLedger ledger` to the constructor and field list, and `import java.time.ZoneId;`
(`DayOfWeek`, `LocalDate`, `TemporalAdjusters` become unused — delete those three imports).

- [ ] **Step 3: Rewrite `BookingService.cancel`**

```java
    @Transactional
    public void cancel(UUID sessionId, UUID membershipId) {
        ClassSession session = sessions.findWithLockById(sessionId).orElseThrow();
        Booking booking = bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, membershipId, "CANCELLED")
                .orElseThrow();
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();

        boolean wasBooked = "BOOKED".equals(booking.getStatus());
        // was_late is computed and stamped HERE, once, from the cutoff in force right now.
        // cancel_cutoff_min is mutable (M15 puts a UI on it) — deriving lateness at read time instead
        // would let a box loosen its cutoff and retroactively forgive every late cancel in its history.
        Instant now = Instant.now();
        boolean late = session.getStartAt().minus(Duration.ofMinutes(box.getCancelCutoffMin())).isBefore(now);

        // Default (allow_late_cancel = false) is exactly the pre-M16a behaviour: a BOOKED booking
        // simply cannot be cancelled past the cutoff. A box that opts in gets a late cancel that
        // succeeds and — unless late_cancel_refunds_entry — burns the entry as well as the cancellation.
        if (wasBooked && late && !box.isAllowLateCancel()) throw conflict("PAST_CUTOFF");

        // A waitlisted athlete never held a place, so their cancellation is free by default; a box can
        // opt into counting it (count_waitlist_cancellations).
        boolean countsCancellation = wasBooked || box.isCountWaitlistCancellations();

        // A lapsed member must still be able to cancel — entitlement gates book(), never cancel()
        // (M10's other half, pinned by BookingEntitlementTest.lapseDoesNotDisturbExistingBookings...).
        // So no active subscription means no cancellation limit to enforce and no ledger row to write.
        Subscription active = subscriptions.activeFor(membershipId).orElse(null);
        if (active != null && countsCancellation) {
            Plan plan = plans.findById(active.getPlanId()).orElseThrow();
            String violated = ledger.firstViolated(PlanLimits.CANCELLATION_RULES, plan, active,
                    session.getStartAt(), ZoneId.of(box.getTimezone()), membershipId);
            if (violated != null) throw conflict("CANCEL_LIMIT_REACHED");
        }

        booking.setStatus("CANCELLED");
        booking.setCancelledAt(now);
        booking.setWasLate(late);
        booking.setPosition(null);
        bookings.save(booking);

        // Lateness only bites someone who actually held a place. A waitlisted athlete cancelling
        // "late" gave up nothing, so their entry always comes back.
        boolean refundEntry = !wasBooked || !late || box.isLateCancelRefundsEntry();
        if (active != null) {
            if (refundEntry) ledger.refundEntry(booking.getId());
            if (countsCancellation) {
                ledger.recordCancellation(booking.getId(), membershipId, active, session.getStartAt());
            }
        }

        if (wasBooked) {
            List<Booking> waitlist = bookings.findBySessionIdAndStatusOrderByPosition(sessionId, "WAITLIST");
            if (!waitlist.isEmpty()) {
                Booking promoted = waitlist.get(0);
                promoted.setStatus("BOOKED");
                promoted.setPosition(null);
                bookings.save(promoted);
                for (int i = 1; i < waitlist.size(); i++) {
                    Booking wl = waitlist.get(i);
                    wl.setPosition(wl.getPosition() - 1);
                    bookings.save(wl);
                }
                // Deliberately no ledger write: the promoted athlete's ENTRY was recorded when they
                // joined the waitlist. Writing one here would double-count them.
            }
        }
    }
```

- [ ] **Step 4: Compile and run the affected classes**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test -Dtest=BookingEngineTest,BookingEntitlementTest,BookingCancellationTest,BookingConcurrencyTest,SlotRegenerationTest > /tmp/m16a-t4.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`. Every pre-existing booking test must still pass unchanged — the defaults preserve
today's behaviour exactly.

- [ ] **Step 5: Full suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test > /tmp/m16a-t4-full.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`, `Tests 524` (514 + 10 from Task 3).

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add backend/src/main/java/com/boxhub/box/EntitlementLedger.java backend/src/main/java/com/boxhub/box/BookingService.java && git commit -m "feat(m16a): EntitlementLedger, and the booking engine on eight limits with a per-box cancellation policy"
```

---

## Task 5 — Box cancellation policy on the wire

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BoxController.java`
- Modify: `backend/src/test/java/com/boxhub/box/BoxSettingsTest.java`

**Interfaces:**
- Consumes: `Box`'s three new accessors (Task 2).
- Produces: three new fields on `GET /api/box/current` and `PATCH /api/box/settings`.

**No new route.** Both endpoints already exist and are already registered in `AuthzConformanceTest`.
**Do not touch `AuthzConformanceTest`** — if the build says otherwise, escalate.

- [ ] **Step 1: Write the failing tests**

Add to `BoxSettingsTest.java` — **open the file first and copy its existing auth/header idiom
exactly**; the snippets below name `adminHeaders()` / `athleteHeaders()` as placeholders for whatever
that class already uses.

```java
    @Test
    void currentServesTheCancellationPolicyFlagsDefaultingToTodaysBehaviour() throws Exception {
        mvc.perform(get("/api/box/current").headers(adminHeaders()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowLateCancel").value(false))
                .andExpect(jsonPath("$.lateCancelRefundsEntry").value(false))
                .andExpect(jsonPath("$.countWaitlistCancellations").value(false));
    }

    @Test
    void adminCanPatchTheCancellationPolicy() throws Exception {
        mvc.perform(patch("/api/box/settings").headers(adminHeaders()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"allowLateCancel\":true,\"lateCancelRefundsEntry\":true,"
                                + "\"countWaitlistCancellations\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowLateCancel").value(true))
                .andExpect(jsonPath("$.lateCancelRefundsEntry").value(true))
                .andExpect(jsonPath("$.countWaitlistCancellations").value(true));
    }

    @Test
    void anAthleteCannotPatchTheCancellationPolicy() throws Exception {
        mvc.perform(patch("/api/box/settings").headers(athleteHeaders()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"allowLateCancel\":true}"))
                .andExpect(status().isForbidden());
    }
```

**Cross-tenant coverage:** `PATCH /api/box/settings` resolves the box from the JWT and never from a
param, so there is no foreign id to pass — the cross-tenant case is structurally impossible on this
route. **Check whether `BoxSettingsTest` already carries a cross-tenant test for it; if it does, leave
it alone, and if it does not, do not invent one** — say so in your report instead, and the
orchestrator decides.

- [ ] **Step 2: Run and watch fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q test -Dtest=BoxSettingsTest > /tmp/m16a-t5.txt 2>&1; echo "EXIT=$?"
```
Expected: FAIL — `$.allowLateCancel` does not exist.

- [ ] **Step 3: Add the fields to both records**

`CurrentBoxResponse` gains three trailing components:

```java
    record CurrentBoxResponse(UUID id, String name, String slug, String timezone, String logoUrl,
                              int cancelCutoffMin, int bookingHorizonWeeks, String locale, String role,
                              boolean allowLateCancel, boolean lateCancelRefundsEntry,
                              boolean countWaitlistCancellations) {
        static CurrentBoxResponse of(Box b) {
            return new CurrentBoxResponse(b.getId(), b.getName(), b.getSlug(), b.getTimezone(), b.getLogoUrl(),
                    b.getCancelCutoffMin(), b.getBookingHorizonWeeks(), b.getLocale(), TenantContext.role(),
                    b.isAllowLateCancel(), b.isLateCancelRefundsEntry(), b.isCountWaitlistCancellations());
        }
    }
```

`PatchSettingsRequest` gains three nullable Booleans, and `patchSettings` three guarded setters:

```java
    record PatchSettingsRequest(String name, String timezone, String logoUrl,
                                @Min(0) Integer cancelCutoffMin, @Min(1) Integer bookingHorizonWeeks,
                                String locale, Boolean allowLateCancel, Boolean lateCancelRefundsEntry,
                                Boolean countWaitlistCancellations) {}
```

```java
        // M16a cancellation policy. cancelCutoffMin above is "how late is late"; these three are what
        // happens then. Nullable so a PATCH that omits them leaves them alone, like every other field here.
        if (req.allowLateCancel() != null) b.setAllowLateCancel(req.allowLateCancel());
        if (req.lateCancelRefundsEntry() != null) b.setLateCancelRefundsEntry(req.lateCancelRefundsEntry());
        if (req.countWaitlistCancellations() != null)
            b.setCountWaitlistCancellations(req.countWaitlistCancellations());
```

- [ ] **Step 4: Run and watch pass**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test -Dtest=BoxSettingsTest > /tmp/m16a-t5.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`.

- [ ] **Step 5: Negative control**

Delete the `if (req.allowLateCancel() != null)` line, re-run, confirm
`adminCanPatchTheCancellationPolicy` goes red, revert, re-run green.

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add backend/src/main/java/com/boxhub/box/BoxController.java backend/src/test/java/com/boxhub/box/BoxSettingsTest.java && git commit -m "feat(m16a): serve and patch the per-box cancellation policy"
```

---

## Task 6 — The eight tests the model exists for

**Files:**
- Create: `backend/src/test/java/com/boxhub/box/EntitlementLimitsTest.java`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: nothing. This is the milestone's evidence.

**Read `BookingEntitlementTest` first and copy its fixture idiom** — standalone box per test,
`actAsBox(boxId)` via a hand-built `Jwt`, `newMembership`, `newSession`, direct `bookingService`
calls. **Do not re-derive it.**

**Every session instant in this class is built from a pinned `LocalDate` in `Europe/Rome`, never from
`Instant.now().plusSeconds(...)`.** Use a fixed future anchor:

```java
    private static final ZoneId ROME = ZoneId.of("Europe/Rome");
    // A Monday, far enough ahead that no test is racing the cancel cutoff. Pinned, not derived from
    // now(): a week/month boundary test that only holds on some days of some months is a coin flip.
    private static final LocalDate MONDAY = LocalDate.of(2027, 3, 1); // 2027-03-01 is a Monday
    private static Instant at(LocalDate d, int hour) { return d.atStartOfDay(ROME).plusHours(hour).toInstant(); }
```

- [ ] **Step 1: Write the regeneration test FIRST**

It is the whole justification for the ledger, and it must be built on a **CANCELLED** booking:
`SlotRegenerationService` **refuses** a range holding a live booking (`RANGE_HAS_BOOKINGS`) and only
ever deletes CANCELLED rows — so a test that regenerates around a live booking proves nothing.

```java
    /**
     * THE test the ledger exists for. Regeneration deletes the CANCELLED bookings in its range (it
     * refuses the range outright if anything live is in it), which would erase both the cancellation
     * and — for a box that allows unrefunded late cancels — the consumed entry behind it. Counting
     * from `bookings` would therefore let a coach editing next month's schedule silently hand every
     * affected athlete their allowance back.
     *
     * Negative control for this one: make EntitlementLedger.firstViolated count from BookingRepository
     * instead of entitlement_usage and this test goes red while every other test in the class stays green.
     */
    @Test
    void regeneratingASlotDoesNotAlterConsumedCounts() {
        // 1. box that counts waitlist cancellations, so a cancel leaves a CANCELLATION row behind
        // 2. plan with cancellations_per_week = 1
        // 3. athlete joins the waitlist of a session generated by a schedule slot, then cancels
        //    -> one CANCELLATION row, and the booking row is now CANCELLED (deletable by regeneration)
        // 4. regenerateFrom(slotId, the day before that session)  -> the CANCELLED booking is deleted
        // 5. the athlete's cancellation count is STILL 1: a second cancel in the same week is blocked
        //    with CANCEL_LIMIT_REACHED
    }
```

Fill that skeleton in against `SlotRegenerationTest`'s fixture for building a `ScheduleSlot` +
`ClassType` and calling `regenerateFrom`. **Open `SlotRegenerationTest` and reuse its helpers rather
than writing new ones.** If the slot/session wiring makes step 3 impossible as described, STOP and
escalate — do not substitute a weaker scenario.

- [ ] **Step 2: Run it, watch it fail, implement nothing**

This test should **pass** against the Task 4 implementation. Prove it is not vacuous by the negative
control named in its own javadoc: temporarily change `EntitlementLedger.firstViolated` to count from
`BookingRepository.countInWeek`, run, **confirm this test goes red**, revert. Report the result.

- [ ] **Step 3: Write the other seven**

```java
    @Test
    void entriesPerDayAndPerWeekBothBind_theFourthInADayIsBlockedWhileTheWeekHasRoom() {
        // plan: entries_per_day = 3, entries_per_week = 10
        // book 3 sessions on MONDAY -> all BOOKED
        // 4th session on MONDAY -> LIMIT_REACHED, and entryLimitViolated names ENTRIES_PER_DAY
        // a session on MONDAY.plusDays(1) -> BOOKED. The week still has room; only the day was full.
    }

    @Test
    void entriesPerWeekBindsOnADayThatIsCompletelyEmpty() {
        // plan: entries_per_day = 3, entries_per_week = 10
        // 10 bookings spread Mon-Thu (3/3/3/1), then a FRIDAY session -> LIMIT_REACHED
        // Friday holds nothing, so this can only be the weekly rule. Names ENTRIES_PER_WEEK.
    }

    @Test
    void anInTimeCancellationGivesTheEntryBackAndTheAthleteCanBookAgain() {
        // plan: entries_per_week = 1. Book MONDAY 10:00. Cancel it (well before the cutoff).
        // Book MONDAY 18:00 -> BOOKED. The refunded ENTRY stopped counting.
    }

    @Test
    void aLateCancellationOnABoxThatAllowsThemBurnsTheEntry() {
        // box: allow_late_cancel = true, late_cancel_refunds_entry = false
        // plan: entries_per_week = 1
        // Book a session inside the cutoff window, cancel it (succeeds — the box allows it),
        // then book another session in the same week -> LIMIT_REACHED. The entry did NOT come back.
        //
        // This is the case spec §2.4 describes and that the pre-M16a engine could not reach at all:
        // PAST_CUTOFF blocked every late cancel of a BOOKED row, so was_late was only ever true on a
        // waitlist cancel (BookingCancellationTest:182). The flag is what makes the rule reachable.
    }

    @Test
    void aCancellationLimitBindsEvenWhenEntriesHaveRoom() {
        // plan: cancellations_per_week = 1, every entry limit NULL
        // Book two sessions, cancel the first (fine), cancel the second -> CANCEL_LIMIT_REACHED.
        // Entries were unlimited throughout, so only the cancellation rule can have fired.
    }

    @Test
    void lastWeeksBookingDoesNotCountAgainstThisWeek() {
        // plan: entries_per_week = 1
        // Book MONDAY.minusWeeks(1) + 10h  and  MONDAY + 10h -> BOTH BOOKED.
        // Windows are anchored to the SESSION, so these fall in different weeks.
        // (Book the earlier session first; both must be in the future relative to now() for the
        //  PAST guard, so pick MONDAY far enough ahead that MONDAY.minusWeeks(1) is still future.)
    }

    @Test
    void entriesTotalIsScopedToTheSubscriptionTermAndDoesNotResetMidWindow() {
        // plan: entries_total = 2, duration_days = 30. Punch card.
        // Book 2 sessions inside the term -> both BOOKED. A 3rd -> LIMIT_REACHED naming ENTRIES_TOTAL.
        // Then recordPeriod() the SAME plan again (a renewal): current_period_start moves forward, and
        // a session in the NEW term books fine while the old term's two rows fall outside its window.
    }
```

**Fill each skeleton in with real code before running anything.** A comment is not a test. If any
scenario cannot be expressed against the real fixtures, escalate with the exact obstacle rather than
weakening the assertion.

- [ ] **Step 4: Run the class**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test -Dtest=EntitlementLimitsTest > /tmp/m16a-t6.txt 2>&1; echo "EXIT=$?"
```
Expected: `EXIT=0`, **8** tests. (This step first said 7; the plan's own Step 1 + Step 3 code blocks specify eight `@Test` methods and its Step 5 mutation table has eight rows. The prose was the stale half, and the executor caught it rather than dropping a test to match.)

- [ ] **Step 5: Negative control on all seven**

For each test, name and perform one mutation that makes it red, then revert. Suggested mutations —
use them, do not improvise a weaker one:

| Test | Mutation |
|---|---|
| `regenerating...` | `firstViolated` counts from `BookingRepository.countInWeek` |
| `entriesPerDayAndPerWeek...` | drop `Period.DAY` from `ENTRY_RULES` |
| `entriesPerWeekBindsOnAnEmptyDay` | drop `Period.WEEK` from `ENTRY_RULES` |
| `anInTimeCancellation...` | make `refundEntry` a no-op |
| `aLateCancellation...` | change `refundEntry` in `cancel()` to unconditional `true` |
| `aCancellationLimitBinds...` | skip the `CANCELLATION_RULES` check in `cancel()` |
| `lastWeeksBooking...` | anchor `window(...)` to `Instant.now()` instead of `sessionStartAt` |
| `entriesTotal...` | make `Period.TOTAL`'s window `[FAR_PAST, FAR_FUTURE)` |

**Report every mutation and its observed failure.** A test whose mutation you cannot name is
decoration — say so rather than counting it.

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add backend/src/test/java/com/boxhub/box/EntitlementLimitsTest.java && git commit -m "test(m16a): AND composition, refunds, cancellation limits, period rollover, term scoping, and regeneration-does-not-alter-counts"
```

---

## Task 7 — Gates

**Files:** none changed unless a gate fails.

**Every command below is absolute-path and unpiped.** `$?` after a pipe is the pipe's.

- [ ] **Step 1: Backend suite**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && \
JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q clean test > /tmp/m16a-gate-backend.txt 2>&1; echo "EXIT=$?"
cd /Users/alessandrolomonaco/dev/boxhub/backend && python3 -c "
import glob,re
t=f=e=s=0
for p in glob.glob('target/surefire-reports/*.txt'):
    m=re.search(r'Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)',open(p).read())
    if m: t+=int(m[1]);f+=int(m[2]);e+=int(m[3]);s+=int(m[4])
print(f'Tests {t} Failures {f} Errors {e} Skipped {s}')"
```
Required: `EXIT=0`, Failures 0, Errors 0, Skipped 0, Tests **535** (511 baseline + 1 + 2 + 10 + 3 + 8). **Measured 535 on 2026-08-22.**

- [ ] **Step 2: Migration head is exactly V28**

```bash
ls /Users/alessandrolomonaco/dev/boxhub/backend/src/main/resources/db/migration/ > /tmp/m16a-migrations.txt
grep -c "^V2[89]__\|^V[3-9][0-9]__" /tmp/m16a-migrations.txt
```
Required: exactly `1` (only `V28__entitlement_model.sql`).

- [ ] **Step 3: Tenancy greps**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && \
grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' > /tmp/m16a-runasroot.txt; \
wc -c < /tmp/m16a-runasroot.txt
```
Required: `0` bytes.

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git diff main --stat -- backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java > /tmp/m16a-authz.txt; wc -c < /tmp/m16a-authz.txt
```
Required: `0` bytes — `AuthzConformanceTest` untouched.

- [ ] **Step 4: THE SCOPE GATE — zero frontend files changed**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git diff main --name-only -- frontend e2e > /tmp/m16a-frontend.txt; wc -c < /tmp/m16a-frontend.txt
```
Required: **`0` bytes.** Any output here is scope leakage and must be reverted, not explained.

- [ ] **Step 5: Karma, e2e, visual — measured, not assumed**

The scope gate above proves no frontend source changed, but the **backend wire** did (three new box
fields, eight new plan fields). Additive JSON is safe in principle; measure it anyway.

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && \
npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m16a-karma.txt 2>&1; echo "EXIT=$?"
grep -E "Executed .* SUCCESS|FAILED" /tmp/m16a-karma.txt | tail -3
```
Required: `EXIT=0`, **419** executed.

```bash
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml down -v > /tmp/m16a-down.txt 2>&1; \
docker compose -f docker/docker-compose.yml build frontend backend > /tmp/m16a-build.txt 2>&1; echo "BUILD=$?"
```
Then run e2e the way this repo runs it — **open `e2e/` and use its existing entry point; do not invent
a command.** Required: **67 passed, 0 failed, 0 skipped.**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && ./e2e/visual.sh > /tmp/m16a-visual.txt 2>&1; echo "EXIT=$?"
```
Required: `EXIT=0`, **31 specs, zero dirty baselines**. Run it in the Linux container, not locally —
locally you compare against baselines your renderer never wrote.

- [ ] **Step 6: §8.1 design greps**

Run all eight greps listed in
`docs/superpowers/specs/2026-08-06-m13c-component-library-design.md` §8.1, each redirected to its own
file. Required: all eight **zero bytes**. (They should be untouched — M16a changes no frontend — but
measuring is the point.)

- [ ] **Step 7: Report every number**

Report the actual measured value for each gate above. **"Did I look, or did I read a report?"** —
paste the numbers, not a summary of them.

---

## Task 8 — Docs and close-out

**Files:**
- Modify: `docs/TENANCY.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/ROADMAP-AT-A-GLANCE.md`
- Modify: `.superpowers/sdd/progress.md`
- Rewrite: `.superpowers/sdd/NEXT-SESSION.md`

- [ ] **Step 1: `docs/TENANCY.md`**

Add `entitlement_usage` to the §8.1 **`@TenantId`** row with the justification: box-operational, the
dominant read is one box counting its own members' consumption. Note that M16a added **no** native
query and **no** `runAsRoot` — every ledger read runs on a request thread inside one box.

- [ ] **Step 2: `docs/BACKLOG.md`** — three lines, one each:

```markdown
- **No-show fee** (M16) — a fee is money (Stripe, receipts, proration), so it belongs with pricing, not with the entitlement model. M16a already gets the *entitlement* half right: a NO_SHOW booking was never cancelled, so its ENTRY stays unrefunded and the class stays consumed.
- **Per-limit 409 reason on booking** (M14b/M17) — `BookingService.book` reports the bare `LIMIT_REACHED` because `book.page.ts:166` switches on that exact string. `entryLimitViolated()` already names which of the eight rules bound; it reaches the wire when the athlete booking screen is rebuilt and can render it.
- **`CANCEL_LIMIT_REACHED` has no copy** (M14b/M17) — `book.page.ts`'s `reason()` has no case for it, so a blocked cancellation currently renders "Something went wrong — try again."
```

- [ ] **Step 3: `docs/HANDOFF.md`** — an M16a section recording:
  - the four user decisions that override the spec (waitlist consumes an entry; the waitlist-cancel
    flag; the bare `LIMIT_REACHED`; late-cancel as box policy);
  - **the obligation to delete the `entitlement`/`weeklyClassLimit` shim** in
    `PlanController.PlanDto` and `SubscriptionController.PlanSummaryDto` when M14b or M17 rebuilds the
    plan screens — recorded explicitly, not left implicit;
  - the corrections this plan made to the spec before building: regeneration **refuses** live
    bookings and only deletes CANCELLED rows (so the ledger's justification is cancellation history
    and late-cancel entries, not live entries); `MigrationGrandfatherTest` stops at V14 and was
    correctly left alone; three wire consumers, not one; five test files needed compile fixes.

- [ ] **Step 4: `docs/ROADMAP-AT-A-GLANCE.md`** — mark M16a done, in execution order, one line.

- [ ] **Step 5: `.superpowers/sdd/NEXT-SESSION.md`** — rewrite it for **M23**, per
  `docs/ROADMAP-AT-A-GLANCE.md` (`M23 → M14b → M14c → M17 → M24 → M25 → M26`). Carry forward, still
  unowned: **`docs/BACKLOG.md`'s `Launch → Production` block belongs to no milestone.** It is the
  third milestone close in a row that it has been raised at. **There is exactly one NEXT-SESSION.md.
  Do not create a second.**

- [ ] **Step 6: Commit, merge, and WAIT FOR CI**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A docs .superpowers && git commit -m "docs(m16a): tenancy classification, the shim's deletion obligation, and M23 next"
cd /Users/alessandrolomonaco/dev/boxhub && git checkout main && git merge --no-ff m16a-entitlement-model && git push
```

**CI runs on `push: main` and `pull_request` only. Pushing a branch starts nothing.** After the push
to `main`, **wait for the run and read it**. M13f was reported done before CI came back, and CI was
red. The milestone is not closed until the run is green.

```bash
cd /Users/alessandrolomonaco/dev/boxhub && gh run watch --exit-status
```

---

## Self-review against the spec

| Spec section | Task |
|---|---|
| §2.1 eight nullable columns | T1 (schema), T2 (entity) |
| §2.2 AND composition, fixed report order | T3 (`ENTRY_RULES` order), T4 (`firstViolated`), T6 tests 1-2 |
| §2.3 windows in box tz, anchored to the session | T3 + `PlanLimitsTest`, T6 `lastWeeksBooking...` |
| §2.4 cancellation refunds the entry / late does not | T4 `cancel()`, T6 tests 3-4 — **changed to box policy per the user** |
| §3 the ledger, no FK on booking_id, copied session_start_at | T1, T2, T6 test 1 |
| §3.2 writes on book / cancel / promotion | T4 — **waitlist consumes at join per the user; promotion writes nothing** |
| §3.3 counting + the `(membership_id, kind, session_start_at)` index | T1, T2 `countInWindow` |
| §4 V28 migration + backfill | T1 |
| §4.1 `entitlement`/`weeklyClassLimit` wire shim | T2 — extended to `SubscriptionController` too |
| §5 gates | T7 |
| §5.1 the seven tests | T6 — shipped as **eight**; see Task 6 |
| §6 out of scope | T7 step 4 is the enforcing gate |

**Placeholder scan:** the seven skeletons in Task 6 Step 3 are comment-specified scenarios, not code.
That is deliberate and flagged in the step itself — each must be written out in full before running,
and the executor is told to escalate rather than weaken any scenario it cannot express. Every other
code block in this plan is complete and paste-ready. `adminHeaders()` / `athleteHeaders()` in Tasks 2
and 5 are explicitly marked as placeholders for the target file's existing idiom, with an instruction
to open the file and copy it rather than invent one.

**Type consistency:** `firstViolated`, `recordEntry`, `recordCancellation`, `refundEntry`, `window`,
`ENTRY_RULES`, `CANCELLATION_RULES`, `FAR_FUTURE`, `isUnlimited()`, and the sixteen `Plan` / six `Box`
accessors are spelled identically in the Interfaces block, in Tasks 2-6, and in the test snippets.


---

## Post-execution corrections (measured 2026-08-22)

Recorded here rather than silently fixed, because each is a claim this plan made that turned out false.

1. **Seven tests were actually eight.** The prose said seven throughout; the Step 1 + Step 3 code
   blocks and the Step 5 mutation table both specify eight. The executor flagged the inconsistency
   instead of dropping a test to match the count. Final gate is **535**, not 534.
2. **The `lastWeeksBooking...` mutation was a FALSE NEGATIVE as the plan specified it.** With only
   the plan's two assertions, anchoring `window(...)` to `Instant.now()` still let both bookings
   succeed — the fixture sits in 2027 while `now()` is 2026, so the mutated window contained neither
   session and the test stayed green under the mutation it was supposed to catch. A third assertion
   (a second session in the SAME week must be blocked by `entriesPerWeek = 1`) is what actually
   distinguishes session-anchored from now-anchored. **This is the negative control earning its
   place: without it the plan would have shipped a test that could not fail.**
3. **`BookingRepository.countInWeek` is NOT dead.** `HomeController:84` still uses it for the
   athlete's weekly check-in count. Its comment was updated to say so; the method stays.
4. **`class_sessions.capacity` has `CHECK (capacity > 0)` (V3)**, so a WAITLIST join cannot be forced
   with `capacity = 0`. Test 1 uses a filler membership on a `capacity = 1` session instead.
