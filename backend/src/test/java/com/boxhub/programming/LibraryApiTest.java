package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.function.UnaryOperator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/box/library: the box's own saved pieces (default) or the 18 global benchmarks merged
 * with the box's own copies (benchmarks=true). Same MockMvc + JWT harness as WodHistoryTest.
 */
class LibraryApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired WodRepository wodRepo;
    @Autowired MovementRepository movements;
    @Autowired ObjectMapper om;

    UUID boxId;
    String coachToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxId = newBox("Library " + n, "library-" + n);
        coachToken = tokenFor(boxId, "library-" + n + "@t.io", "COACH");
    }

    private UUID newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private String tokenFor(UUID box, String email, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(box).orElseThrow());
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private UUID seedLibraryWod(String title, boolean library, Instant updatedAt) {
        return seedLibraryWod(title, library, updatedAt, "WORKOUT", null, "{\"blocks\":[]}");
    }

    private UUID seedLibraryWod(String title, boolean library, Instant updatedAt, String macro, String timingPreset) {
        return seedLibraryWod(title, library, updatedAt, macro, timingPreset, "{\"blocks\":[]}");
    }

    /** Direct repository insert (not the POST endpoint) so updatedAt is set explicitly rather than
     *  relied on from insert timing (Global Constraints: paging test needs distinct values). */
    private UUID seedLibraryWod(String title, boolean library, Instant updatedAt, String macro,
                                String timingPreset, String blocksJson) {
        return TenantContext.runAsBox(boxId, () -> {
            Wod w = new Wod();
            w.setTitle(title);
            w.setMacro(macro);
            w.setTimingPreset(timingPreset);
            w.setScoreType("TIME");
            w.setLibrary(library);
            w.setBlocksJson(blocksJson);
            w.setUpdatedAt(updatedAt.truncatedTo(ChronoUnit.MICROS));
            return wodRepo.save(w).getId();
        });
    }

    private UUID movementId(String name) {
        return movements.findVisible(boxId).stream()
                .filter(m -> m.getName().equals(name))
                .findFirst().orElseThrow().getId();
    }

    /** A movementId line, optionally one level deep in a child block (WodJsonValidator's cap is
     *  two levels; the child here carries only lines, never grandchildren). */
    private String blocksWithMovement(UUID movementId, boolean nested) throws Exception {
        WodJson.Line line = new WodJson.Line("Move", movementId, "10", null, null, null, "REPS");
        WodJson.Block leaf = new WodJson.Block("Block", null, List.of(line), null);
        WodJson.Block top = nested ? new WodJson.Block("Outer", null, null, List.of(leaf)) : leaf;
        return om.writeValueAsString(new WodJson.Blocks(List.of(top)));
    }

    private JsonNode library(String token, UnaryOperator<MockHttpServletRequestBuilder> customize) throws Exception {
        MockHttpServletRequestBuilder req = get("/api/box/library").header("Authorization", "Bearer " + token);
        String json = mvc.perform(customize.apply(req))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(json);
    }

    private static Set<String> ids(JsonNode page) {
        Set<String> out = new HashSet<>();
        for (JsonNode row : page.get("rows")) out.add(row.get("wod").get("id").asText());
        return out;
    }

    private static JsonNode rowByTitle(JsonNode page, String title) {
        for (JsonNode row : page.get("rows")) {
            if (title.equals(row.get("wod").get("title").asText())) return row;
        }
        throw new NoSuchElementException(title);
    }

    private UUID franTemplateId() throws Exception {
        String json = mvc.perform(get("/api/box/benchmarks").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        for (JsonNode n : om.readTree(json)) {
            if ("Fran".equals(n.get("name").asText())) return UUID.fromString(n.get("id").asText());
        }
        throw new NoSuchElementException("Fran benchmark not found");
    }

    // --- Task R3, test 1: default mode pages 50 newest first -------------------------------------

    @Test
    void defaultModePagesFiftyNewestFirstByUpdatedAt() throws Exception {
        Instant base = Instant.now();
        for (int i = 0; i < 55; i++) {
            seedLibraryWod("Piece " + i, true, base.plusSeconds(i));
        }
        seedLibraryWod("Class copy", false, base.plusSeconds(1000)); // library=false must never appear

        JsonNode page1 = library(coachToken, r -> r);
        assertThat(page1.get("rows").size()).isEqualTo(50);
        assertThat(page1.get("total").asLong()).isEqualTo(55);
        assertThat(page1.get("nextCursor").isNull()).isFalse();
        assertThat(page1.get("rows").get(0).get("wod").get("title").asText()).isEqualTo("Piece 54");
        assertThat(page1.get("rows").get(49).get("wod").get("title").asText()).isEqualTo("Piece 5");
        for (JsonNode row : page1.get("rows")) assertThat(row.get("wod").get("title").asText()).isNotEqualTo("Class copy");

        String cursor = page1.get("nextCursor").asText();
        JsonNode page2 = library(coachToken, r -> r.param("cursor", cursor));
        assertThat(page2.get("rows").size()).isEqualTo(5);
        assertThat(page2.get("nextCursor").isNull()).isTrue();
        assertThat(page2.get("rows").get(0).get("wod").get("title").asText()).isEqualTo("Piece 4");
        assertThat(page2.get("rows").get(4).get("wod").get("title").asText()).isEqualTo("Piece 0");
        for (JsonNode row : page2.get("rows")) assertThat(row.get("wod").get("title").asText()).isNotEqualTo("Class copy");
    }

    // --- Task R3, test 2: q -----------------------------------------------------------------------

    @Test
    void shortQueryIsIgnoredLongQueryFiltersTitle() throws Exception {
        seedLibraryWod("Burner AMRAP", true, Instant.now());
        seedLibraryWod("Something else", true, Instant.now().plusSeconds(1));

        JsonNode ignored = library(coachToken, r -> r.param("q", "ab"));
        assertThat(ignored.get("rows").size()).isEqualTo(2);

        JsonNode filtered = library(coachToken, r -> r.param("q", "bur"));
        assertThat(filtered.get("rows").size()).isEqualTo(1);
        assertThat(filtered.get("rows").get(0).get("wod").get("title").asText()).isEqualTo("Burner AMRAP");
    }

    // --- Task R3, test 3: macro/timing AND -----------------------------------------------------

    @Test
    void macroAndTimingFiltersCombineWithAnd() throws Exception {
        UUID strengthAmrap = seedLibraryWod("Strength AMRAP piece", true, Instant.now(), "STRENGTH", "AMRAP");
        seedLibraryWod("Strength for-time piece", true, Instant.now().plusSeconds(1), "STRENGTH", "FOR_TIME");
        seedLibraryWod("Workout AMRAP piece", true, Instant.now().plusSeconds(2), "WORKOUT", "AMRAP");

        JsonNode macroOnly = library(coachToken, r -> r.param("macro", "STRENGTH"));
        assertThat(macroOnly.get("rows").size()).isEqualTo(2);

        JsonNode timingOnly = library(coachToken, r -> r.param("timing", "AMRAP"));
        assertThat(timingOnly.get("rows").size()).isEqualTo(2);

        JsonNode both = library(coachToken, r -> r.param("macro", "STRENGTH").param("timing", "AMRAP"));
        assertThat(both.get("rows").size()).isEqualTo(1);
        assertThat(both.get("rows").get(0).get("wod").get("id").asText()).isEqualTo(strengthAmrap.toString());
    }

    // --- Task R3, test 4: movement filter -- verify the .as(String.class) predicate FIRST -------

    @Test
    void movementFilterMatchesNestedBlocksTooAndOrsAcrossRepeatedParams() throws Exception {
        UUID thruster = movementId("Thruster");
        UUID pullUp = movementId("Pull-Up");

        UUID topLevelThruster = seedLibraryWod("Thruster top-level", true, Instant.now(), "WORKOUT", null,
                blocksWithMovement(thruster, false));
        UUID nestedThruster = seedLibraryWod("Thruster nested", true, Instant.now().plusSeconds(1), "WORKOUT", null,
                blocksWithMovement(thruster, true));
        UUID pullUpPiece = seedLibraryWod("Pull-Up piece", true, Instant.now().plusSeconds(2), "WORKOUT", null,
                blocksWithMovement(pullUp, false));

        JsonNode thrusterOnly = library(coachToken, r -> r.param("movement", thruster.toString()));
        assertThat(ids(thrusterOnly)).containsExactlyInAnyOrder(topLevelThruster.toString(), nestedThruster.toString());

        JsonNode either = library(coachToken, r -> r.param("movement", thruster.toString())
                .param("movement", pullUp.toString()));
        assertThat(ids(either)).containsExactlyInAnyOrder(
                topLevelThruster.toString(), nestedThruster.toString(), pullUpPiece.toString());
    }

    // --- Task R3, test 5: benchmarks=true merges globals with box copies -------------------------

    @Test
    void benchmarkModeMergesGlobalTemplatesWithBoxCopiesAndFiltersByKind() throws Exception {
        JsonNode all = library(coachToken, r -> r.param("benchmarks", "true"));
        assertThat(all.get("total").asLong()).isEqualTo(18);
        assertThat(all.get("rows").size()).isEqualTo(18);
        assertThat(all.get("nextCursor").isNull()).isTrue();
        for (JsonNode row : all.get("rows")) {
            assertThat(row.get("global").asBoolean()).isTrue();
            assertThat(List.of("GIRL", "HERO")).contains(row.get("benchmarkKind").asText());
            assertThat(row.get("wod").get("blocks").get("blocks").size()).isGreaterThan(0);
        }

        UUID franTemplateId = franTemplateId();
        mvc.perform(post("/api/box/benchmarks/" + franTemplateId + "/clone")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isCreated());

        JsonNode afterClone = library(coachToken, r -> r.param("benchmarks", "true"));
        assertThat(afterClone.get("total").asLong()).isEqualTo(18); // minus one global, plus one box copy
        assertThat(afterClone.get("rows").size()).isEqualTo(18);
        JsonNode franRow = rowByTitle(afterClone, "Fran");
        assertThat(franRow.get("global").asBoolean()).isFalse();
        assertThat(franRow.get("benchmarkKind").asText()).isEqualTo("GIRL");
        assertThat(franRow.get("wod").get("blocks").get("blocks").get(0).get("lines").get(0).get("load").asText())
                .isEqualTo("43"); // this box defaults to KG (Box.weightUnit field default)

        JsonNode heroesOnly = library(coachToken, r -> r.param("benchmarks", "true").param("kind", "HERO"));
        assertThat(heroesOnly.get("total").asLong()).isEqualTo(6);
        assertThat(heroesOnly.get("rows").size()).isEqualTo(6);
        for (JsonNode row : heroesOnly.get("rows")) assertThat(row.get("benchmarkKind").asText()).isEqualTo("HERO");
    }

    /** Adding the same benchmark to the library twice is two rows with one benchmarkTemplateId.
     *  Benchmark mode shows that benchmark once, as the most recently edited copy -- not a 500. */
    @Test
    void twoCopiesOfOneBenchmarkShowOnceAsTheNewest() throws Exception {
        UUID franTemplateId = franTemplateId();
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/box/benchmarks/" + franTemplateId + "/clone")
                            .header("Authorization", "Bearer " + coachToken))
                    .andExpect(status().isCreated());
        }
        UUID newest = TenantContext.runAsBox(boxId, () -> {
            List<Wod> copies = wodRepo.findByLibraryTrueAndBenchmarkTemplateIdIsNotNull();
            Wod w = copies.get(0);
            w.setTitle("Fran, edited");
            w.setUpdatedAt(Instant.now().plusSeconds(60).truncatedTo(ChronoUnit.MICROS));
            return wodRepo.save(w).getId();
        });

        JsonNode page = library(coachToken, r -> r.param("benchmarks", "true"));
        assertThat(page.get("rows").size()).isEqualTo(18);
        List<String> franIds = new java.util.ArrayList<>();
        for (JsonNode row : page.get("rows"))
            if (franTemplateId.toString().equals(row.get("wod").get("benchmarkTemplateId").asText()))
                franIds.add(row.get("wod").get("id").asText());
        assertThat(franIds).containsExactly(newest.toString());
    }

    // --- Task R3, test 6: auth + cross-tenant, including with the movement filter ----------------

    @Test
    void athleteIsForbiddenAndAnotherBoxSeesNoneOfThisBoxsLibraryEvenWithAMovementFilter() throws Exception {
        UUID thruster = movementId("Thruster");
        seedLibraryWod("Box A piece", true, Instant.now(), "WORKOUT", null, blocksWithMovement(thruster, false));

        String athlete = tokenFor(boxId, "lib-ath-" + System.nanoTime() + "@t.io", "ATHLETE");
        mvc.perform(get("/api/box/library").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());

        UUID otherBox = newBox("Library Other " + System.nanoTime(), "library-o-" + System.nanoTime());
        String otherCoach = tokenFor(otherBox, "lib-oc-" + System.nanoTime() + "@t.io", "COACH");

        JsonNode withoutMovement = library(otherCoach, r -> r);
        assertThat(withoutMovement.get("rows").size()).isZero();
        assertThat(withoutMovement.get("total").asLong()).isZero();

        // Same movement id (a global movement, visible cross-box) -- proves the @TenantId filter on
        // Wod still applies even though the movement predicate reaches into blocks_json.
        JsonNode withMovement = library(otherCoach, r -> r.param("movement", thruster.toString()));
        assertThat(withMovement.get("rows").size()).isZero();
    }
}
