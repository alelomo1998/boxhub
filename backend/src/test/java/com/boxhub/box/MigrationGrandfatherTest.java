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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Standalone container — deliberately NOT AbstractIntegrationTest's shared singleton and no
 * Spring context. The shared container already has V14 migrated against an empty schema (0
 * pre-existing memberships), so the grandfather INSERTs there touch 0 rows and any assertion
 * against it is a vacuous 0==0 — it proves nothing and is order-dependent on whatever other test
 * classes have created bare Memberships first. Here we drive Flyway ourselves, seed genuine
 * pre-V14 rows, then migrate to V14 and pin the grandfather SQL's actual behavior.
 */
@Testcontainers
class MigrationGrandfatherTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void grandfathersPreV14MembershipsIntoActiveNoExpirySubscriptions() throws Exception {
        migrateTo("13");

        UUID boxA, boxB, planA, membershipWithPlan, membershipWithoutPlan, membershipBoxB;
        try (Connection c = connect()) {
            boxA = insertBox(c, "grandfather-a-" + System.nanoTime());
            boxB = insertBox(c, "grandfather-b-" + System.nanoTime());
            planA = insertPlan(c, boxA, "Unlimited", 3);
            membershipWithPlan = insertMembership(c, boxA, insertUser(c, "with-plan"), planA);
            membershipWithoutPlan = insertMembership(c, boxA, insertUser(c, "no-plan-a"), null);
            membershipBoxB = insertMembership(c, boxB, insertUser(c, "no-plan-b"), null);
        }

        migrateTo("14");

        try (Connection c = connect()) {
            assertThat(columnExists(c, "memberships", "plan_id")).isFalse();

            // Global invariant: every seeded membership has exactly one ACTIVE, no-expiry subscription.
            int memberships = count(c, "select count(*) from memberships");
            int grandfathered = count(c,
                    "select count(*) from subscription where status = 'ACTIVE' and current_period_end is null");
            assertThat(grandfathered).isEqualTo(memberships);
            int dupes = count(c, "select count(*) from (select membership_id from subscription " +
                    "where status='ACTIVE' group by membership_id having count(*) > 1) x");
            assertThat(dupes).isZero();

            // The membership that already had a plan keeps that exact plan.
            assertThat(subscriptionPlanId(c, membershipWithPlan)).isEqualTo(planA);

            // Plan-less memberships get their OWN box's synthetic 'Grandfathered' plan, not the
            // other box's — this is the per-box synthetic-plan path the migration's subquery
            // (`p.box_id = m.box_id`) is meant to guarantee.
            UUID grandfatheredA = grandfatheredPlanId(c, boxA);
            UUID grandfatheredB = grandfatheredPlanId(c, boxB);
            assertThat(grandfatheredA).isNotEqualTo(grandfatheredB);
            assertThat(subscriptionPlanId(c, membershipWithoutPlan)).isEqualTo(grandfatheredA);
            assertThat(subscriptionPlanId(c, membershipBoxB)).isEqualTo(grandfatheredB);

            // Entitlement backfill: a plan that already had a weekly limit becomes WEEKLY_LIMIT,
            // and the synthetic plans the migration creates are UNLIMITED.
            assertThat(count(c, "select count(*) from plans where id = '" + planA + "' " +
                    "and entitlement = 'WEEKLY_LIMIT'")).isEqualTo(1);
            assertThat(count(c, "select count(*) from plans where name = 'Grandfathered' " +
                    "and entitlement <> 'UNLIMITED'")).isZero();
        }
    }

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

    private static UUID insertBox(Connection c, String slug) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into boxes (id, name, slug, timezone) values (?, ?, ?, 'Europe/Rome')")) {
            ps.setObject(1, id);
            ps.setString(2, "Box " + slug);
            ps.setString(3, slug);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertPlan(Connection c, UUID boxId, String name, int weeklyLimit) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into plans (id, box_id, name, weekly_class_limit) values (?, ?, ?, ?)")) {
            ps.setObject(1, id);
            ps.setObject(2, boxId);
            ps.setString(3, name);
            ps.setInt(4, weeklyLimit);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertUser(Connection c, String tag) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into users (id, email, password_hash, name) values (?, ?, 'x', ?)")) {
            ps.setObject(1, id);
            ps.setString(2, tag + "-" + System.nanoTime() + "@t.io");
            ps.setString(3, tag);
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertMembership(Connection c, UUID boxId, UUID userId, UUID planId) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into memberships (id, user_id, box_id, role, plan_id) values (?, ?, ?, 'ATHLETE', ?)")) {
            ps.setObject(1, id);
            ps.setObject(2, userId);
            ps.setObject(3, boxId);
            ps.setObject(4, planId);
            ps.executeUpdate();
        }
        return id;
    }

    private static boolean columnExists(Connection c, String table, String column) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "select count(*) from information_schema.columns where table_name = ? and column_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1) > 0;
            }
        }
    }

    private static int count(Connection c, String sql) throws Exception {
        try (ResultSet rs = c.createStatement().executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static UUID subscriptionPlanId(Connection c, UUID membershipId) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "select plan_id from subscription where membership_id = ? and status = 'ACTIVE'")) {
            ps.setObject(1, membershipId);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).isTrue();
                return (UUID) rs.getObject(1);
            }
        }
    }

    private static UUID grandfatheredPlanId(Connection c, UUID boxId) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "select id from plans where box_id = ? and name = 'Grandfathered'")) {
            ps.setObject(1, boxId);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).isTrue();
                return (UUID) rs.getObject(1);
            }
        }
    }
}
