package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Drives WodController's create/get exactly like WodControllerTest: MockMvc + a coach JWT. Request
 * bodies are built as a Map (rather than a static text block) because these tests vary macro,
 * timingPreset, timing, blocks and scales independently -- a fixed literal would need one per case.
 */
class WodAxesWireTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;

    String coachToken;
    UUID boxId;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box box = newBox("Axes Box " + n, "axes-" + n);
        boxId = box.getId();
        coachToken = boxToken("axes-" + n + "@t.io", box, "COACH");
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    /** A minimal valid request body; each test overrides only the fields it cares about. */
    private Map<String, Object> req() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", "W");
        m.put("scoreType", "NONE");
        return m;
    }

    private WodController.WodDto createWod(Map<String, Object> body) throws Exception {
        String json = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return om.readValue(json, WodController.WodDto.class);
    }

    private int createWodStatus(Map<String, Object> body) throws Exception {
        return mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content(om.writeValueAsString(body)))
                .andReturn().getResponse().getStatus();
    }

    private WodController.WodDto getWod(UUID id) throws Exception {
        String json = mvc.perform(get("/api/box/wods/" + id)
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readValue(json, WodController.WodDto.class);
    }

    private Map<String, Object> blocksOf(WodJson.Line line) {
        return Map.of("blocks", List.of(Map.of("label", "A", "lines", List.of(line))));
    }

    private WodJson.Line firstLine(WodController.WodDto dto) {
        return dto.blocks().blocks().get(0).lines().get(0);
    }

    /** Inserts a row directly, bypassing the controller/entity defaults, to simulate a pre-M14c
     *  row whose blocks_json still carries the legacy free-text `scaling` string. */
    private UUID insertRawBlocksJson(String blocksJson) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into wod (id, box_id, title, macro, score_type, blocks_json) " +
                        "values (?, ?, 'Legacy', 'WORKOUT', 'NONE', ?::jsonb)",
                id, boxId, blocksJson);
        return id;
    }

    /**
     * THE TYPE-LOSS ASSERTION. A pre-M14a CIRCUIT/CUSTOM/SKILL wod reopened with a blank select
     * because WodTypeWire composes CIRCUIT and CUSTOM back as WORKOUT and SKILL as GYMNASTIC.
     * The rebuilt editor sends the axes directly, so the value must survive the round trip
     * UNTOUCHED. If this ever fails, someone has routed the editor back through wodType.
     */
    @Test
    void axesSentDirectlyRoundTripUnchanged() throws Exception {
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("scoreType", "NONE");
        var created = createWod(body);
        var read = getWod(created.id());
        assertThat(read.macro()).isEqualTo("WORKOUT");
        assertThat(read.timingPreset()).isNull();
    }

    @Test
    void tabataIsExpressibleForTheFirstTime() throws Exception {
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("timingPreset", "TABATA");
        body.put("scoreType", "ROUNDS_REPS");
        var created = createWod(body);
        assertThat(getWod(created.id()).timingPreset()).isEqualTo("TABATA");
    }

    /** The segment sequence was built in M14a and never persisted. 8 x (20s work, 10s rest). */
    @Test
    void timingSegmentsArePersisted() throws Exception {
        var timing = new WodJson.Timing(8, List.of(
                new WodJson.Segment(20, "WORK", null, 0),
                new WodJson.Segment(10, "REST", null, null)));
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("timingPreset", "TABATA");
        body.put("scoreType", "ROUNDS_REPS");
        body.put("timing", timing);
        var created = createWod(body);
        var read = getWod(created.id());
        assertThat(read.timing().rounds()).isEqualTo(8);
        assertThat(read.timing().segments()).hasSize(2);
        assertThat(read.timing().segments().get(0).blockIndex()).isEqualTo(0);
        assertThat(read.timing().segments().get(1).kind()).isEqualTo("REST");
    }

    /** The legacy path must keep working: seven screens and AuthzConformanceTest still send it. */
    @Test
    void legacyWodTypeStillCreatesAndStillComesBack() throws Exception {
        var body = req();
        body.put("wodType", "FOR_TIME");
        body.put("scoreType", "TIME");
        var created = createWod(body);
        var read = getWod(created.id());
        assertThat(read.macro()).isEqualTo("WORKOUT");
        assertThat(read.timingPreset()).isEqualTo("FOR_TIME");
        assertThat(read.wodType()).isEqualTo("FOR_TIME");
    }

    /** Two-level nesting was built in M14a and has never had a wire field either. */
    @Test
    void twoLevelBlocksSurviveTheRoundTrip() throws Exception {
        var inner = new WodJson.Block("21-15-9", null,
                List.of(new WodJson.Line("Thruster", null, "21", "42kg", null, null)), null);
        var outer = new WodJson.Block("Fran", null, null, List.of(inner));
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("timingPreset", "FOR_TIME");
        body.put("scoreType", "TIME");
        body.put("blocks", new WodJson.Blocks(List.of(outer)));
        var created = createWod(body);
        var read = getWod(created.id());
        assertThat(read.blocks().blocks().get(0).blocks().get(0).lines().get(0).text())
                .isEqualTo("Thruster");
    }

    /** User-asked 2026-09-07: multiple scaling options per exercise (spec 5A). */
    @Test
    void aLineCarriesSeveralScalingOptions() throws Exception {
        var line = new WodJson.Line("Muscle-up", null, "6", null, null, List.of(
                new WodJson.Scale("Pull-up", null, "12", null),
                new WodJson.Scale("Ring row", null, "20", null)));
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("scoreType", "TIME");
        body.put("blocks", blocksOf(line));
        var created = createWod(body);
        var read = firstLine(getWod(created.id()));
        assertThat(read.scales()).hasSize(2);
        assertThat(read.scales().get(1).reps()).isEqualTo("20");
    }

    /**
     * No migration: blocks_json is JSONB and the legacy free-text scaling has almost no reader.
     * A historical row is normalised on READ into a one-entry list, so the API has one meaning
     * and the row heals itself the next time it is saved.
     */
    @Test
    void aLegacyScalingStringReadsAsAOneEntryList() throws Exception {
        var id = insertRawBlocksJson("""
                {"blocks":[{"label":"A","lines":[{"text":"Muscle-up","scaling":"ring rows"}]}]}
                """);
        var read = firstLine(getWod(id));
        assertThat(read.scales()).hasSize(1);
        assertThat(read.scales().get(0).text()).isEqualTo("ring rows");
        assertThat(read.scaling()).isNull();
    }

    @Test
    void aSeventhScaleIsRefused() throws Exception {
        var seven = java.util.stream.IntStream.range(0, 7)
                .mapToObj(i -> new WodJson.Scale("alt " + i, null, "1", null)).toList();
        var line = new WodJson.Line("Muscle-up", null, "6", null, null, seven);
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("scoreType", "TIME");
        body.put("blocks", blocksOf(line));
        assertThat(createWodStatus(body)).isEqualTo(400);
    }

    @Test
    void aScaleSayingNothingIsRefused() throws Exception {
        var line = new WodJson.Line("Muscle-up", null, "6", null, null,
                List.of(new WodJson.Scale(null, null, null, null)));
        var body = req();
        body.put("macro", "WORKOUT");
        body.put("scoreType", "TIME");
        body.put("blocks", blocksOf(line));
        assertThat(createWodStatus(body)).isEqualTo(400);
    }
}
