package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** V31 schema facts (AMENDMENT A1). Flyway has already run against the container by the time this executes. */
class MessagingMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void announcementNoLongerUniquePerBox() {
        // The whole point of D-4: history needs many rows per box. Untouched by V31.
        Integer n = jdbc.queryForObject("""
                select count(*) from pg_constraint
                 where conname = 'announcement_box_id_key'
                """, Integer.class);
        assertThat(n).isZero();
    }

    @Test
    void messagingTablesExist() {
        assertThat(tableExists("message_thread")).isTrue();
        assertThat(tableExists("message")).isTrue();
        assertThat(tableExists("announcement_recipient")).isTrue();
    }

    @Test
    void senderSideColumnIsGone() {
        assertThat(columnExists("message", "sender_side")).isFalse();
    }

    @Test
    void messageThreadHasPairColumnsNotASingleMembershipId() {
        assertThat(columnExists("message_thread", "membership_id")).isFalse();
        assertThat(columnExists("message_thread", "member_lo_id")).isTrue();
        assertThat(columnExists("message_thread", "member_hi_id")).isTrue();
        assertThat(columnExists("message_thread", "lo_last_read_at")).isTrue();
        assertThat(columnExists("message_thread", "hi_last_read_at")).isTrue();
        assertThat(columnExists("message_thread", "last_sender_membership_id")).isTrue();
        assertThat(columnExists("message_thread", "last_message_from_staff")).isFalse();
        assertThat(columnExists("message_thread", "staff_last_read_at")).isFalse();
    }

    /** A1.3: the pair is stored in canonical order — the database enforces it, not app care. */
    @Test
    void pairOrderCheckRejectsAnOutOfOrderInsert() {
        UUID box = seedBox();
        UUID x = seedMembership(box);
        UUID y = seedMembership(box);
        // Deliberately backwards. Ordered by STRING form, which matches Postgres's byte-wise uuid
        // comparison — java.util.UUID.compareTo (signed long halves) disagrees roughly half the
        // time and is NOT what the check constraint enforces.
        UUID first = x.toString().compareTo(y.toString()) < 0 ? y : x; // the larger one
        UUID second = x.toString().compareTo(y.toString()) < 0 ? x : y; // the smaller one
        assertThatThrownBy(() -> jdbc.update("""
                insert into message_thread (box_id, member_lo_id, member_hi_id)
                values (?, ?, ?)
                """, box, first, second)).isInstanceOf(Exception.class);
    }

    @Test
    void pairUniqueConstraintExists() {
        Integer n = jdbc.queryForObject("""
                select count(*) from pg_constraint where conname = 'uq_message_thread_pair'
                """, Integer.class);
        assertThat(n).isEqualTo(1);
    }

    private UUID seedBox() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into boxes (id, name, slug, timezone) values (?, ?, ?, 'Europe/Rome')",
                id, "MigBox" + id, "migbox-" + id);
        return id;
    }

    private UUID seedMembership(UUID boxId) {
        UUID userId = UUID.randomUUID();
        jdbc.update("""
                insert into users (id, email, password_hash, name)
                values (?, ?, 'x', 'M')
                """, userId, "u" + userId + "@t.io");
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into memberships (id, user_id, box_id, role, status)
                values (?, ?, ?, 'ATHLETE', 'ACTIVE')
                """, id, userId, boxId);
        return id;
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
