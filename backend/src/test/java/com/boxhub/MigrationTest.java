package com.boxhub;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class MigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void flywayCreatedCoreTables() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_name in ('users','boxes','memberships','refresh_tokens','plans','invites')
                """, Integer.class);
        assertThat(count).isEqualTo(6);
    }

    @Test
    void v2AddedColumns() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where (table_name = 'memberships' and column_name = 'plan_id')
                   or (table_name = 'boxes' and column_name = 'logo_url')
                """, Integer.class);
        assertThat(count).isEqualTo(2);
    }

    @Test
    void v3AddedSchedulingTables() {
        Integer t = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_name in ('class_templates','class_sessions','bookings')
                """, Integer.class);
        assertThat(t).isEqualTo(3);
    }

    @Test
    void v4ProgrammingTablesSurviveMinusRetired() {
        // track + program_slot were retired by V7; the library tables remain
        Integer t = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_name in ('movement','benchmark_template','wod')
                """, Integer.class);
        assertThat(t).isEqualTo(3);
        Integer gone = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_name in ('track','program_slot')
                """, Integer.class);
        assertThat(gone).isZero();
    }

    @Test
    void v5SeededMovementsAndBenchmarks() {
        Integer m = jdbc.queryForObject("select count(*) from movement where box_id is null", Integer.class);
        assertThat(m).isGreaterThanOrEqualTo(100);
        Integer b = jdbc.queryForObject("select count(*) from benchmark_template", Integer.class);
        assertThat(b).isGreaterThanOrEqualTo(15);
    }

    @Test
    void v7ClassModel() {
        Integer t = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_name in ('session_item','template_piece','announcement','wod_score','lift_entry')
                """, Integer.class);
        assertThat(t).isEqualTo(5);
        Integer c = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where (table_name='class_sessions' and column_name='programming_status')
                   or (table_name='class_templates' and column_name='image_path')
                   or (table_name='memberships' and column_name='avatar_path')
                   or (table_name='memberships' and column_name='private')
                """, Integer.class);
        assertThat(c).isEqualTo(4);
        Integer uq = jdbc.queryForObject("""
                select count(*) from pg_indexes
                where tablename='wod_score' and indexdef like '%UNIQUE%' and indexdef like '%session_item_id%'
                """, Integer.class);
        assertThat(uq).isEqualTo(1);
    }
}
