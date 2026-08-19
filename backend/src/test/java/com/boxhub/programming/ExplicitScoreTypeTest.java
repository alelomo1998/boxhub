package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class ExplicitScoreTypeTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void noSessionItemHasANullScoreType() {
        Integer nulls = jdbc.queryForObject(
                "select count(*) from session_item where score_type is null", Integer.class);
        assertThat(nulls).isZero();
    }

    @Test
    void theColumnIsMandatory() {
        String nullable = jdbc.queryForObject("""
                select is_nullable from information_schema.columns
                where table_name = 'session_item' and column_name = 'score_type'
                """, String.class);
        assertThat(nullable).isEqualTo("NO");
    }
}
