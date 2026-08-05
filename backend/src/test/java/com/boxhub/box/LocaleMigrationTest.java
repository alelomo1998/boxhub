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
 * Standalone container, own Flyway — same reasoning as {@link MigrationGrandfatherTest}: the
 * shared AbstractIntegrationTest container already has V18 migrated against an empty schema, so
 * rows inserted through it are never "pre-existing" relative to the migration. Here we seed real
 * pre-V18 rows via raw JDBC (bypassing the User/Box entity mapping entirely, so a Hibernate
 * default couldn't paper over a bare DB default), then migrate to V18 and read the column back
 * with raw SQL — pinning the DEFAULT clause's actual behavior rather than assuming it from the
 * migration source.
 */
@Testcontainers
class LocaleMigrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void preExistingUsersAndBoxesGetEnglishNotNull() throws Exception {
        migrateTo("17");

        UUID userId, boxId;
        try (Connection c = connect()) {
            userId = insertUser(c);
            boxId = insertBox(c);
        }

        migrateTo("18");

        try (Connection c = connect()) {
            assertThat(columnExists(c, "users", "locale")).isTrue();
            assertThat(columnExists(c, "boxes", "locale")).isTrue();

            assertThat(localeOf(c, "users", userId)).isEqualTo("en");
            assertThat(localeOf(c, "boxes", boxId)).isEqualTo("en");

            assertThat(isNotNullConstrained(c, "users", "locale")).isTrue();
            assertThat(isNotNullConstrained(c, "boxes", "locale")).isTrue();
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

    /** No locale column exists yet at V17 — this insert is exactly what a real pre-V18 row looked like. */
    private static UUID insertUser(Connection c) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into users (id, email, password_hash, name) values (?, ?, 'x', 'Pre-V18 User')")) {
            ps.setObject(1, id);
            ps.setString(2, "pre-v18-" + System.nanoTime() + "@t.io");
            ps.executeUpdate();
        }
        return id;
    }

    private static UUID insertBox(Connection c) throws Exception {
        UUID id = UUID.randomUUID();
        try (PreparedStatement ps = c.prepareStatement(
                "insert into boxes (id, name, slug, timezone) values (?, 'Pre-V18 Box', ?, 'Europe/Rome')")) {
            ps.setObject(1, id);
            ps.setString(2, "pre-v18-" + System.nanoTime());
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

    private static boolean isNotNullConstrained(Connection c, String table, String column) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "select is_nullable from information_schema.columns where table_name = ? and column_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return "NO".equals(rs.getString(1));
            }
        }
    }

    private static String localeOf(Connection c, String table, UUID id) throws Exception {
        try (PreparedStatement ps = c.prepareStatement("select locale from " + table + " where id = ?")) {
            ps.setObject(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).isTrue();
                return rs.getString(1); // getString(1) on a SQL NULL would return Java null, not "en"
            }
        }
    }
}
