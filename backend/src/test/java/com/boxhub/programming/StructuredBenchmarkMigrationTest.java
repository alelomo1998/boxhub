package com.boxhub.programming;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * V36__structured_benchmarks.sql: every global benchmark_template row gets structured blocks_json
 * whose line movementIds resolve into V5's global movement catalogue, and D21 deletes stale
 * plain-text library {@code wod} rows nothing references. Own Postgres + full Flyway migrate
 * (harness mirrors {@link com.boxhub.box.ClassModelSplitMigrationTest}) since V36 runs against
 * V5's seeded reference data, not AbstractIntegrationTest's already-migrated singleton container.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StructuredBenchmarkMigrationTest {

    // Mirrors V36__structured_benchmarks.sql's D21 delete predicate exactly (comment there names it).
    // program_slot from the plan was dropped by V7__class_model.sql; the migration guards only
    // session_item and post, so this predicate does too.
    private static final String D21_DELETE_PREDICATE = """
            w.library = true
              and jsonb_array_length(coalesce(w.blocks_json->'blocks', '[]'::jsonb)) = 0
              and btrim(w.body_text) <> ''
              and not exists (select 1 from session_item i where i.wod_id = w.id)
              and not exists (select 1 from post p where p.wod_id = w.id)
            """;

    private PostgreSQLContainer<?> postgres;
    private JdbcTemplate jdbc;

    @BeforeAll
    void migrate() {
        postgres = new PostgreSQLContainer<>("postgres:16-alpine");
        postgres.start();

        DriverManagerDataSource ds = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);

        Flyway.configure().dataSource(ds).load().migrate(); // no target = latest, from empty
    }

    @AfterAll
    void stopContainer() {
        if (postgres != null) postgres.stop();
    }

    @Test
    void everyBenchmarkHasAtLeastOneResolvedLine() {
        Integer emptyBlocks = jdbc.queryForObject("""
                select count(*) from benchmark_template
                where jsonb_array_length(coalesce(blocks_json -> 'blocks', '[]'::jsonb)) = 0
                """, Integer.class);
        assertThat(emptyBlocks).as("benchmark_template rows with no blocks").isZero();

        Integer unresolved = jdbc.queryForObject("""
                select count(*) from benchmark_template, jsonb_path_query(blocks_json, '$.blocks[*].lines[*]') l
                where l ->> 'movementId' is null
                """, Integer.class);
        assertThat(unresolved).as("lines whose movementId did not resolve").isZero();
    }

    @Test
    void fransFirstLineIsThrusterTwentyOneFifteenNineAtNinetyFive() {
        Map<String, Object> row = jdbc.queryForMap("""
                select blocks_json -> 'blocks' -> 0 -> 'lines' -> 0 ->> 'text' as text,
                       blocks_json -> 'blocks' -> 0 -> 'lines' -> 0 ->> 'reps' as reps,
                       blocks_json -> 'blocks' -> 0 -> 'lines' -> 0 ->> 'load' as load
                from benchmark_template where name = 'Fran'
                """);
        assertThat(row.get("text")).isEqualTo("Thruster");
        assertThat(row.get("reps")).isEqualTo("21-15-9");
        assertThat(row.get("load")).isEqualTo("95");
    }

    /**
     * The DELETE already ran by the time this test's rows exist (it fires inside V36, which is
     * part of the one Flyway.migrate() call above), so the deletion rule itself is verified by
     * running its predicate as a plain SELECT COUNT against rows this test inserts post-migration.
     */
    @Test
    void deletionPredicateCountsOnlyUnreferencedPlainTextLibraryRows() {
        UUID box = UUID.randomUUID();
        jdbc.update("insert into boxes (id, name, slug, timezone) values (?, 'Del box', 'del-box', 'Europe/Rome')", box);

        UUID user = UUID.randomUUID();
        jdbc.update("insert into users (id, email, password_hash, name) values (?, 'del@t.io', 'x', 'Del')", user);
        UUID membership = UUID.randomUUID();
        jdbc.update("insert into memberships (id, user_id, box_id, role) values (?, ?, ?, 'COACH')", membership, user, box);

        UUID session = UUID.randomUUID();
        jdbc.update("""
                insert into class_sessions (id, box_id, name, start_at, duration_min, capacity)
                values (?, ?, 'WOD Class', now() + interval '1 day', 60, 12)
                """, session, box);

        // matches the predicate: plain-text library row, nothing references it
        insertWod(box, true, "{\"blocks\":[]}", "Some text");
        // does not match: not library
        insertWod(box, false, "{\"blocks\":[]}", "Some text");
        // does not match: blank body
        insertWod(box, true, "{\"blocks\":[]}", "");
        // does not match: has structured blocks
        insertWod(box, true, "{\"blocks\":[{\"label\":\"x\",\"lines\":[]}]}", "Some text");

        // does not match: referenced by a session_item
        UUID referencedBySession = insertWod(box, true, "{\"blocks\":[]}", "Some text");
        jdbc.update("""
                insert into session_item (id, box_id, session_id, wod_id, sort_order, score_type)
                values (?, ?, ?, ?, 0, 'NONE')
                """, UUID.randomUUID(), box, session, referencedBySession);

        // does not match: referenced by a post
        UUID referencedByPost = insertWod(box, true, "{\"blocks\":[]}", "Some text");
        jdbc.update("""
                insert into post (id, box_id, author_membership_id, wod_id, visibility)
                values (?, ?, ?, ?, 'BOX')
                """, UUID.randomUUID(), box, membership, referencedByPost);

        Integer count = jdbc.queryForObject(
                "select count(*) from wod w where " + D21_DELETE_PREDICATE, Integer.class);
        assertThat(count).isEqualTo(1);
    }

    private UUID insertWod(UUID box, boolean library, String blocksJson, String bodyText) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into wod (id, box_id, title, macro, score_type, body_text, blocks_json, library)
                values (?, ?, 'Test', 'WORKOUT', 'NONE', ?, ?::jsonb, ?)
                """, id, box, bodyText, blocksJson, library);
        return id;
    }
}
