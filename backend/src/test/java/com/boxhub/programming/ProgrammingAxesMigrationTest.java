package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ProgrammingAxesMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void wodTypeIsGoneFromBothTables() {
        Integer cols = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where column_name = 'wod_type' and table_name in ('wod','template_piece')
                """, Integer.class);
        assertThat(cols).isZero();
    }

    @Test
    void timingPresetIsConstrained() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                jdbc.update("update wod set timing_preset = 'NONSENSE' where true"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
