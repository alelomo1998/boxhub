package com.boxhub.box;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A real Flyway-on-seeded-data harness — NOT {@link com.boxhub.AbstractIntegrationTest}, whose
 * singleton container is already fully migrated by the time any test runs, so V19 there migrates an
 * empty {@code class_templates} and every assertion becomes a schema invariant (an FK, a @TenantId
 * write) rather than a check on migration behaviour. See tasks-1-4-review.md finding 3.
 * <p>
 * This class owns its own Postgres: migrate to V18, seed {@code class_templates} / {@code
 * template_piece} / {@code class_sessions} with plain JDBC (V19 deletes {@code class_templates}, so no
 * JPA entity survives to do this for us), migrate to V19, assert. The seed shapes real pre-M14a dev
 * data — several same-named rows across weekdays sharing one duplicated skeleton, in TWO boxes with
 * the same class name — so each assertion below fails for exactly one named mutation rather than
 * passing on an empty table. Spec §7 needs the identical shape for V20, so this harness is built to be
 * extended (bump the seed to V19 state, add a `migrateTo(20)`), not thrown away.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ClassModelSplitMigrationTest {

    private static final UUID BOX_A = UUID.randomUUID();
    private static final UUID BOX_B = UUID.randomUUID();
    private static final UUID T1 = UUID.randomUUID(); // box A, "WOD Class", weekday 0
    private static final UUID T2 = UUID.randomUUID(); // box A, "WOD Class", weekday 1
    private static final UUID T3 = UUID.randomUUID(); // box A, "WOD Class", weekday 2
    private static final UUID T4 = UUID.randomUUID(); // box B, "WOD Class", weekday 0 — must NOT merge with A
    private static final UUID SESSION = UUID.randomUUID(); // box A, generated from T1

    private PostgreSQLContainer<?> postgres;
    private JdbcTemplate jdbc;

    @BeforeAll
    void migrateSeedAndMigrate() {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine");
        postgres.start();

        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);

        Flyway.configure().dataSource(ds).target("18").load().migrate();

        seed();

        Flyway.configure().dataSource(ds).load().migrate(); // no target = latest = V19
    }

    @AfterAll
    void stopContainer() {
        if (postgres != null) postgres.stop();
    }

    private void seed() {
        jdbc.update("insert into boxes (id, name, slug, timezone) values (?, 'Mig A', 'mig-a', 'Europe/Rome')", BOX_A);
        jdbc.update("insert into boxes (id, name, slug, timezone) values (?, 'Mig B', 'mig-b', 'Europe/Rome')", BOX_B);

        insertTemplate(T1, BOX_A, "WOD Class", 0);
        insertTemplate(T2, BOX_A, "WOD Class", 1);
        insertTemplate(T3, BOX_A, "WOD Class", 2);
        insertTemplate(T4, BOX_B, "WOD Class", 0);

        // box A: the same skeleton duplicated across all three weekday rows — the pre-M14a
        // DevDataSeeder shape that V19's dedup DELETE exists to collapse.
        for (UUID templateId : List.of(T1, T2, T3)) {
            insertPiece(BOX_A, templateId, 0, "Warm-up", "WARMUP");
            insertPiece(BOX_A, templateId, 1, "Strength", "STRENGTH");
        }
        // box B: a different skeleton on its own same-named class — must not merge with A's.
        insertPiece(BOX_B, T4, 0, "Different", "WARMUP");

        jdbc.update("""
                insert into class_sessions (id, box_id, template_id, name, start_at, duration_min, capacity)
                values (?, ?, ?, 'WOD Class', now() + interval '1 day', 60, 12)
                """, SESSION, BOX_A, T1);
    }

    private void insertTemplate(UUID id, UUID boxId, String name, int weekday) {
        jdbc.update("""
                insert into class_templates (id, box_id, name, weekday, start_time, duration_min, capacity, active)
                values (?, ?, ?, ?, '18:00', 60, 12, true)
                """, id, boxId, name, weekday);
    }

    private void insertPiece(UUID boxId, UUID templateId, int sortOrder, String label, String wodType) {
        jdbc.update("""
                insert into template_piece (box_id, template_id, sort_order, label, wod_type)
                values (?, ?, ?, ?, ?)
                """, boxId, templateId, sortOrder, label, wodType);
    }

    private UUID typeIdFor(UUID boxId) {
        return jdbc.queryForObject(
                "select id from class_type where box_id = ? and name = 'WOD Class'", UUID.class, boxId);
    }

    @Test
    void classTemplatesIsGone() {
        Integer left = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'class_templates'",
                Integer.class);
        assertThat(left).isZero();
    }

    @Test
    void scheduleSlotIdReusesTheSeededTemplateId() {
        // catches a gen_random_uuid() in the schedule_slot insert replacing "select t.id, ..."
        for (UUID templateId : List.of(T1, T2, T3, T4)) {
            Integer found = jdbc.queryForObject(
                    "select count(*) from schedule_slot where id = ?", Integer.class, templateId);
            assertThat(found).as("schedule_slot reusing seeded id " + templateId).isEqualTo(1);
        }
    }

    @Test
    void sameNamedRowsCollapsePerBoxAndDoNotMergeAcrossBoxes() {
        // catches dropping "ct.box_id = t.box_id" from the class_type join (cross-tenant merge)
        UUID typeA = typeIdFor(BOX_A);
        UUID typeB = typeIdFor(BOX_B);
        assertThat(typeA).isNotEqualTo(typeB);

        for (UUID templateId : List.of(T1, T2, T3)) {
            UUID slotType = jdbc.queryForObject(
                    "select class_type_id from schedule_slot where id = ?", UUID.class, templateId);
            assertThat(slotType).as("slot " + templateId + " should collapse into box A's type").isEqualTo(typeA);
        }
        UUID slotTypeB = jdbc.queryForObject(
                "select class_type_id from schedule_slot where id = ?", UUID.class, T4);
        assertThat(slotTypeB).as("box B's slot must not merge into box A's type").isEqualTo(typeB);
    }

    @Test
    void sessionsStillPointAtTheSlotTheyCameFrom() {
        UUID slotId = jdbc.queryForObject(
                "select schedule_slot_id from class_sessions where id = ?", UUID.class, SESSION);
        assertThat(slotId).isEqualTo(T1);
    }

    @Test
    void skeletonPiecesHangOffTheRightClassType() {
        // catches a backfill that reads the wrong column (e.g. joining on the wrong id)
        UUID typeA = typeIdFor(BOX_A);
        UUID typeB = typeIdFor(BOX_B);

        Integer crossBoxLeak = jdbc.queryForObject("""
                select count(*) from template_piece
                where (box_id = ? and class_type_id <> ?) or (box_id = ? and class_type_id <> ?)
                """, Integer.class, BOX_A, typeA, BOX_B, typeB);
        assertThat(crossBoxLeak).isZero();
    }

    @Test
    void duplicatedSkeletonsCollapseToOneSet() {
        // catches deleting V19's dedup DELETE
        UUID typeA = typeIdFor(BOX_A);
        List<String> labels = jdbc.queryForList(
                "select label from template_piece where class_type_id = ? order by sort_order",
                String.class, typeA);
        assertThat(labels).containsExactly("Warm-up", "Strength"); // not the 6 duplicated rows seeded

        UUID typeB = typeIdFor(BOX_B);
        Integer countB = jdbc.queryForObject(
                "select count(*) from template_piece where class_type_id = ?", Integer.class, typeB);
        assertThat(countB).isEqualTo(1); // box B's own (non-duplicated) skeleton survives untouched
    }
}
