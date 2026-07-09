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
        Integer c = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where table_name='boxes' and column_name in ('cancel_cutoff_min','booking_horizon_weeks')
                """, Integer.class);
        assertThat(c).isEqualTo(2);
    }
}
