package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** V33 schema facts. Flyway has already run against the container by the time this executes. */
class BuilderMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void wodCarriesLibraryProvenance() {
        assertThat(columnExists("wod", "source_wod_id")).isTrue();
    }

    @Test
    void wodCarriesTeamAuthoring() {
        assertThat(columnExists("wod", "team_size")).isTrue();
        assertThat(columnExists("wod", "team_share")).isTrue();
    }

    @Test
    void wodScoreCarriesTeamGrouping() {
        assertThat(columnExists("wod_score", "team_id")).isTrue();
        assertThat(columnExists("wod_score", "team_name")).isTrue();
    }

    /**
     * A team result is N rows sharing an id, so the existing per-athlete uniqueness MUST survive:
     * one athlete still gets exactly one result per piece (spec 5.2).
     */
    @Test
    void oneResultPerAthletePerPieceStillHolds() {
        Integer n = jdbc.queryForObject("""
                select count(*) from pg_constraint
                 where conrelid = 'wod_score'::regclass and contype = 'u'
                """, Integer.class);
        assertThat(n).isEqualTo(1);
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbc.queryForObject(
                "select count(*) from information_schema.columns where table_name = ? and column_name = ?",
                Integer.class, table, column);
        return n != null && n > 0;
    }
}
