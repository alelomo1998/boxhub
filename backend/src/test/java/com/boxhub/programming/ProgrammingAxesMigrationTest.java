package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V20's schema shape. The migration's DATA behaviour is tested where rows exist before it runs —
 * the owned-container Flyway harness in ClassModelSplitMigrationTest — not here, because this
 * container is already fully migrated and `wod` was empty when V20 executed against it.
 */
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
        // Seed our OWN row and update it by id. `where true` against an empty table updates nothing
        // and throws nothing, so the original form failed or passed on whether other test classes had
        // happened to leave rows behind — an ordering dependency, not a constraint check.
        UUID boxId = UUID.randomUUID();
        jdbc.update("insert into boxes (id, name, slug) values (?, 'Axes', ?)",
                boxId, "axes-" + System.nanoTime());
        UUID wodId = UUID.randomUUID();
        jdbc.update("""
                insert into wod (id, box_id, title, macro, score_type)
                values (?, ?, 'Axes probe', 'WORKOUT', 'NONE')
                """, wodId, boxId);

        assertThatThrownBy(() -> jdbc.update("update wod set timing_preset = 'NONSENSE' where id = ?", wodId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
