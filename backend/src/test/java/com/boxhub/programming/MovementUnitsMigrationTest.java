package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** V35 schema facts. Flyway has already run against the container by the time this executes. */
class MovementUnitsMigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void movementCarriesUnitsAndLoadable() {
        assertThat(columnExists("movement", "units")).isTrue();
        assertThat(columnExists("movement", "loadable")).isTrue();
    }

    @Test
    void assaultBikeIsCaloriesAndMetresNotLoadable() {
        assertThat(unitsOf("Assault Bike")).isEqualTo("CAL,M,KM,MI,SEC");
        assertThat(loadableOf("Assault Bike")).isFalse();
    }

    @Test
    void backSquatIsRepsAndLoadable() {
        assertThat(unitsOf("Back Squat")).isEqualTo("REPS");
        assertThat(loadableOf("Back Squat")).isTrue();
    }

    @Test
    void sledPushIsDistanceAndLoadable() {
        assertThat(unitsOf("Sled Push")).isEqualTo("M,FT,SEC");
        assertThat(loadableOf("Sled Push")).isTrue();
    }

    private String unitsOf(String name) {
        return jdbc.queryForObject(
                "select units from movement where name = ? and box_id is null", String.class, name);
    }

    private boolean loadableOf(String name) {
        return jdbc.queryForObject(
                "select loadable from movement where name = ? and box_id is null", Boolean.class, name);
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbc.queryForObject(
                "select count(*) from information_schema.columns where table_name = ? and column_name = ?",
                Integer.class, table, column);
        return n != null && n > 0;
    }
}
