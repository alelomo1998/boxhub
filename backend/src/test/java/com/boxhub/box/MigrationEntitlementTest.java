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
