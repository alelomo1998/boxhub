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
