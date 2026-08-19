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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A real Flyway-on-seeded-data harness — NOT {@link com.boxhub.AbstractIntegrationTest}, whose
 * singleton container is already fully migrated by the time any test runs, so V19/V20 there migrate
 * an empty table and every assertion becomes a schema invariant (an FK, a @TenantId write) rather
 * than a check on migration behaviour. See tasks-1-4-review.md finding 3.
 * <p>
 * This class owns its own Postgres: migrate to V18, seed {@code class_templates} / {@code
 * template_piece} / {@code class_sessions} / {@code wod} / {@code session_item} with plain JDBC (V19
 * deletes {@code class_templates}, so no JPA entity survives to do this for us), migrate to latest
 * (V19 then V20 in one Flyway.migrate() call), assert. The seed shapes real pre-M14a dev data — same-
 * named rows across weekdays sharing one duplicated skeleton, a SECOND class type in box A (closes a
 * gap the M14a re-review flagged: three same-typed slots meant a within-box join bug could pass
 * unnoticed), and in TWO boxes with the same class name — so each assertion below fails for exactly
 * one named mutation rather than passing on an empty table.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ClassModelSplitMigrationTest {

    private static final UUID BOX_A = UUID.randomUUID();
    private static final UUID BOX_B = UUID.randomUUID();
    private static final UUID T1 = UUID.randomUUID(); // box A, "WOD Class", weekday 0
    private static final UUID T2 = UUID.randomUUID(); // box A, "WOD Class", weekday 1
    private static final UUID T3 = UUID.randomUUID(); // box A, "WOD Class", weekday 2
    private static final UUID T4 = UUID.randomUUID(); // box B, "WOD Class", weekday 0 — must NOT merge with A
    private static final UUID T5 = UUID.randomUUID(); // box A, "Strength Class", weekday 3 — box A's SECOND type
    private static final UUID SESSION = UUID.randomUUID(); // box A, generated from T1

    // one wod per legacy wod_type value, box A — proves the full V20 vocabulary mapping table
    private static final Map<String, UUID> WOD_BY_TYPE = Map.of(
            "FOR_TIME", UUID.randomUUID(), "AMRAP", UUID.randomUUID(), "INTERVAL", UUID.randomUUID(),
            "EMOM", UUID.randomUUID(), "STRENGTH", UUID.randomUUID(), "WARMUP", UUID.randomUUID(),
            "SKILL", UUID.randomUUID(), "CIRCUIT", UUID.randomUUID(), "CUSTOM", UUID.randomUUID());

    // session_item rows exercising the score_type backfill: null -> derived, non-null -> preserved
    private static final UUID SI_NULL_FOR_TIME = UUID.randomUUID();  // -> TIME
    private static final UUID SI_NULL_AMRAP = UUID.randomUUID();     // -> ROUNDS_REPS
    private static final UUID SI_NULL_INTERVAL = UUID.randomUUID();  // -> ROUNDS_REPS
    private static final UUID SI_NULL_STRENGTH = UUID.randomUUID();  // -> LOAD
    private static final UUID SI_NULL_EMOM = UUID.randomUUID();      // -> NONE (non-obvious: misses all 3 preset branches)
    private static final UUID SI_NULL_WARMUP = UUID.randomUUID();    // -> NONE
    private static final UUID SI_KEEP_EXISTING = UUID.randomUUID();  // score_type already 'LOAD' on a FOR_TIME wod — must NOT become 'TIME'

    private static final String FOR_TIME_BLOCKS = """
            {"blocks":[{"label":"For Time","note":"21-15-9","lines":[{"text":"Thrusters","reps":"21-15-9"},{"text":"Pull-Ups","reps":"21-15-9"}]}]}""";

    private PostgreSQLContainer<?> postgres;
    private JdbcTemplate jdbc;
    private String blocksJsonBeforeMigration;

    @BeforeAll
    void migrateSeedAndMigrate() {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine");
        postgres.start();

        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);

        Flyway.configure().dataSource(ds).target("18").load().migrate();

        seed();

        // captured before V20 runs, so the "unchanged" assertion compares against what was actually
        // stored, not against the literal we typed (Postgres may reformat jsonb on write)
        blocksJsonBeforeMigration = jdbc.queryForObject(
                "select blocks_json::text from wod where id = ?", String.class, WOD_BY_TYPE.get("FOR_TIME"));

        Flyway.configure().dataSource(ds).load().migrate(); // no target = latest = V19 then V20
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
        insertTemplate(T5, BOX_A, "Strength Class", 3); // box A's second class type

        // box A: the same skeleton duplicated across all three weekday rows — the pre-M14a
        // DevDataSeeder shape that V19's dedup DELETE exists to collapse.
        for (UUID templateId : List.of(T1, T2, T3)) {
            insertPiece(BOX_A, templateId, 0, "Warm-up", "WARMUP");
            insertPiece(BOX_A, templateId, 1, "Strength", "STRENGTH");
        }
        // box A's second type: its own distinct skeleton, so a within-box join bug (mixing this
        // type's pieces with "WOD Class"'s) has something to collide with.
        insertPiece(BOX_A, T5, 0, "Heavy Singles", "STRENGTH");
        // box B: a different skeleton on its own same-named class — must not merge with A's.
        insertPiece(BOX_B, T4, 0, "Different", "WARMUP");

        jdbc.update("""
                insert into class_sessions (id, box_id, template_id, name, start_at, duration_min, capacity)
                values (?, ?, ?, 'WOD Class', now() + interval '1 day', 60, 12)
                """, SESSION, BOX_A, T1);

        WOD_BY_TYPE.forEach((wodType, id) -> insertWod(id, BOX_A, "Wod " + wodType, wodType,
                wodType.equals("FOR_TIME") ? FOR_TIME_BLOCKS : "{\"blocks\":[]}"));

        int sort = 0;
        insertItem(SI_NULL_FOR_TIME, sort++, WOD_BY_TYPE.get("FOR_TIME"), null);
        insertItem(SI_NULL_AMRAP, sort++, WOD_BY_TYPE.get("AMRAP"), null);
        insertItem(SI_NULL_INTERVAL, sort++, WOD_BY_TYPE.get("INTERVAL"), null);
        insertItem(SI_NULL_STRENGTH, sort++, WOD_BY_TYPE.get("STRENGTH"), null);
        insertItem(SI_NULL_EMOM, sort++, WOD_BY_TYPE.get("EMOM"), null);
        insertItem(SI_NULL_WARMUP, sort++, WOD_BY_TYPE.get("WARMUP"), null);
        insertItem(SI_KEEP_EXISTING, sort++, WOD_BY_TYPE.get("FOR_TIME"), "LOAD");
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

    private void insertWod(UUID id, UUID boxId, String title, String wodType, String blocksJson) {
        jdbc.update("""
                insert into wod (id, box_id, title, wod_type, score_type, blocks_json)
                values (?, ?, ?, ?, 'NONE', ?::jsonb)
                """, id, boxId, title, wodType, blocksJson);
    }

    private void insertItem(UUID id, int sortOrder, UUID wodId, String scoreType) {
        jdbc.update("""
                insert into session_item (id, box_id, session_id, wod_id, sort_order, score_type)
                values (?, ?, ?, ?, ?, ?)
                """, id, BOX_A, SESSION, wodId, sortOrder, scoreType);
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
        for (UUID templateId : List.of(T1, T2, T3, T4, T5)) {
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
        // catches a backfill that reads the wrong column (e.g. joining on the wrong id).
        // Box A legitimately has TWO class types now (typeA + its "Strength Class" type), so this
        // only flags a piece landing outside BOTH of box A's types, or leaking into box B's.
        UUID typeA = typeIdFor(BOX_A);
        UUID typeAStrength = jdbc.queryForObject(
                "select id from class_type where box_id = ? and name = 'Strength Class'", UUID.class, BOX_A);
        UUID typeB = typeIdFor(BOX_B);

        Integer crossBoxLeak = jdbc.queryForObject("""
                select count(*) from template_piece
                where (box_id = ? and class_type_id not in (?, ?)) or (box_id = ? and class_type_id <> ?)
                """, Integer.class, BOX_A, typeA, typeAStrength, BOX_B, typeB);
        assertThat(crossBoxLeak).isZero();
    }

    @Test
    void secondClassTypeInBoxAGetsItsOwnSkeletonNotWodClass() {
        // closes the M14a re-review gap: box A now has TWO class types, so a join bug that assigns
        // T5's pieces to "WOD Class" (or vice versa) has somewhere to actually go wrong.
        UUID typeA = typeIdFor(BOX_A);
        UUID typeStrength = jdbc.queryForObject(
                "select id from class_type where box_id = ? and name = 'Strength Class'", UUID.class, BOX_A);
        assertThat(typeStrength).isNotEqualTo(typeA);

        List<String> strengthLabels = jdbc.queryForList(
                "select label from template_piece where class_type_id = ?", String.class, typeStrength);
        assertThat(strengthLabels).containsExactly("Heavy Singles");

        List<String> wodClassLabels = jdbc.queryForList(
                "select label from template_piece where class_type_id = ? order by sort_order",
                String.class, typeA);
        assertThat(wodClassLabels).containsExactly("Warm-up", "Strength"); // "Heavy Singles" did not leak in
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

    @Test
    void everyLegacyWodTypeLandsOnV20sMappingTable() {
        // spec §4.4's table, verbatim — catches a swapped case branch in the V20 UPDATE
        assertMacroAndTiming("FOR_TIME", "WORKOUT", "FOR_TIME");
        assertMacroAndTiming("AMRAP", "WORKOUT", "AMRAP");
        assertMacroAndTiming("EMOM", "WORKOUT", "EMOM");
        assertMacroAndTiming("INTERVAL", "WORKOUT", "INTERVAL");
        assertMacroAndTiming("STRENGTH", "STRENGTH", null);
        assertMacroAndTiming("WARMUP", "WARMUP", null);
        assertMacroAndTiming("SKILL", "GYMNASTIC", null);
        assertMacroAndTiming("CIRCUIT", "WORKOUT", null);
        assertMacroAndTiming("CUSTOM", "WORKOUT", null);
    }

    private void assertMacroAndTiming(String legacyWodType, String expectedMacro, String expectedTimingPreset) {
        UUID wodId = WOD_BY_TYPE.get(legacyWodType);
        Map<String, Object> row = jdbc.queryForMap(
                "select macro, timing_preset from wod where id = ?", wodId);
        assertThat(row.get("macro")).as(legacyWodType + " macro").isEqualTo(expectedMacro);
        assertThat(row.get("timing_preset")).as(legacyWodType + " timing_preset").isEqualTo(expectedTimingPreset);
    }

    @Test
    void everyWodThatExistedBeforeV20IsMarkedLibrary() {
        // catches "update wod set library = true" being dropped or scoped wrong. Unlike the deleted
        // ProgrammingAxesMigrationTest.existingRowsAreMarkedAsLibrary (which ran against a container
        // where wod was EMPTY when V20 migrated, so the backfill touched zero rows and the assertion
        // only ever passed on JPA leftovers from unrelated tests), these WOD_BY_TYPE rows are seeded
        // BEFORE V20 runs — this is the one place the backfill claim can actually be tested.
        for (UUID wodId : WOD_BY_TYPE.values()) {
            Boolean library = jdbc.queryForObject("select library from wod where id = ?", Boolean.class, wodId);
            assertThat(library).as("wod " + wodId).isTrue();
        }
    }

    @Test
    void blocksJsonContentSurvivesByteForByte() {
        // catches V20 touching blocks_json at all (spec decision 8): compares what was actually
        // stored (captured before V20 ran) against what is stored after, not a null check.
        String after = jdbc.queryForObject(
                "select blocks_json::text from wod where id = ?", String.class, WOD_BY_TYPE.get("FOR_TIME"));
        assertThat(after).isEqualTo(blocksJsonBeforeMigration);
        assertThat(after).contains("Thrusters", "21-15-9"); // sanity: the capture itself isn't vacuous
    }

    @Test
    void sessionItemScoreTypeIsBackfilledFromTheOldDerivationRule() {
        // catches a wrong branch in Task 7's backfill CASE — including the non-obvious EMOM miss
        assertScoreType(SI_NULL_FOR_TIME, "TIME");
        assertScoreType(SI_NULL_AMRAP, "ROUNDS_REPS");
        assertScoreType(SI_NULL_INTERVAL, "ROUNDS_REPS");
        assertScoreType(SI_NULL_STRENGTH, "LOAD");
        assertScoreType(SI_NULL_EMOM, "NONE");
        assertScoreType(SI_NULL_WARMUP, "NONE");
    }

    @Test
    void sessionItemScoreTypeAlreadySetIsNotOverwritten() {
        // catches "set score_type = case ..." replacing "coalesce(si.score_type, case ...)"
        assertScoreType(SI_KEEP_EXISTING, "LOAD"); // would be 'TIME' if the backfill overwrote it
    }

    private void assertScoreType(UUID itemId, String expected) {
        String scoreType = jdbc.queryForObject(
                "select score_type from session_item where id = ?", String.class, itemId);
        assertThat(scoreType).as("session_item " + itemId).isEqualTo(expected);
    }

    @Test
    void sessionItemScoreTypeColumnIsMandatoryAfterBackfill() {
        String nullable = jdbc.queryForObject("""
                select is_nullable from information_schema.columns
                where table_name = 'session_item' and column_name = 'score_type'
                """, String.class);
        assertThat(nullable).isEqualTo("NO");
    }
}
