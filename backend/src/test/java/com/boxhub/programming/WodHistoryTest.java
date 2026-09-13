package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/box/wods/history: every piece a class has actually run, newest first, paged and
 * search-filtered. Same MockMvc + JWT harness as WodGrowthTest.
 */
class WodHistoryTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired ObjectMapper om;

    UUID boxId;
    String coachToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxId = newBox("History " + n, "history-" + n);
        coachToken = tokenFor(boxId, "history-" + n + "@t.io", "COACH");
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

    /** library = true is a shared library entry; false is a piece that belongs to one class. */
    private UUID createWod(String token, String title, boolean library) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("macro", "WORKOUT");
        body.put("timingPreset", "FOR_TIME");
        body.put("scoreType", "TIME");
        body.put("library", library);
        String json = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(json).get("id").asText());
    }

    private UUID createWod(String title, boolean library) throws Exception {
        return createWod(coachToken, title, library);
    }

    private static String fromLibrary(UUID libraryWodId) {
        return "{\"fromLibraryWodId\":\"" + libraryWodId + "\",\"scoreable\":false}";
    }

    /** A session at a fixed offset from now. MICROS: see Global Constraints. */
    private UUID seedSession(long offsetSeconds, String status) {
        return TenantContext.runAsBox(boxId, () -> {
            ClassSession s = new ClassSession();
            s.setName("History Class");
            s.setStartAt(Instant.now().plusSeconds(offsetSeconds).truncatedTo(ChronoUnit.MICROS));
            s.setDurationMin(60);
            s.setCapacity(12);
            s.setStatus(status);
            return sessions.save(s).getId();
        });
    }

    private void attach(UUID session, UUID... libraryWods) throws Exception {
        String items = java.util.Arrays.stream(libraryWods).map(WodHistoryTest::fromLibrary)
                .collect(java.util.stream.Collectors.joining(","));
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[" + items + "]}"))
                .andExpect(status().isOk());
    }

    private JsonNode history(String token, String query) throws Exception {
        String json = mvc.perform(get("/api/box/wods/history" + query).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(json);
    }

    @Test
    void listsPastPiecesNewestFirstAndSkipsFutureCancelledAndLibrary() throws Exception {
        UUID lib = createWod("Grace", true);
        UUID older = seedSession(-7200, "SCHEDULED");
        UUID newer = seedSession(-3600, "SCHEDULED");
        UUID future = seedSession(3600, "SCHEDULED");
        UUID cancelled = seedSession(-1800, "CANCELLED");
        attach(older, lib); attach(newer, lib); attach(future, lib); attach(cancelled, lib);

        JsonNode page = history(coachToken, "");
        JsonNode rows = page.get("rows");
        assertThat(rows.size()).isEqualTo(2);
        assertThat(rows.get(0).get("sessionId").asText()).isEqualTo(newer.toString());
        assertThat(rows.get(1).get("sessionId").asText()).isEqualTo(older.toString());
        assertThat(rows.get(0).get("className").asText()).isEqualTo("History Class");
        assertThat(rows.get(0).get("wod").get("title").asText()).isEqualTo("Grace");
        assertThat(rows.get(0).get("wod").get("id").asText()).isNotEqualTo(lib.toString()); // the class's copy
        assertThat(page.get("nextBefore").isNull()).isTrue();
    }

    @Test
    void searchFiltersOnTitle() throws Exception {
        UUID grace = createWod("Grace", true);
        UUID helen = createWod("Helen", true);
        attach(seedSession(-3600, "SCHEDULED"), grace, helen);
        JsonNode rows = history(coachToken, "?search=hel").get("rows");
        assertThat(rows.size()).isEqualTo(1);
        assertThat(rows.get(0).get("wod").get("title").asText()).isEqualTo("Helen");
    }

    @Test
    void pagesByBeforeWithoutSplittingAClass() throws Exception {
        UUID a = createWod("A", true);
        UUID b = createWod("B", true);
        // 26 past classes x 2 pieces = 52 rows, one distinct start per class.
        for (int i = 1; i <= 26; i++) attach(seedSession(-3600L * i, "SCHEDULED"), a, b);

        JsonNode first = history(coachToken, "");
        assertThat(first.get("rows").size()).isEqualTo(50);
        String cursor = first.get("nextBefore").asText();
        assertThat(cursor).isNotEmpty();

        JsonNode second = history(coachToken, "?before=" + cursor);
        assertThat(second.get("rows").size()).isEqualTo(2);
        assertThat(second.get("nextBefore").isNull()).isTrue();
    }

    /** The trim itself: 17 classes x 3 pieces = 51 rows, so row 50 and the probe row 51 are the same
     *  class. Without the trim this pages 50 then 1 and splits class 17 across two pages. */
    @Test
    void aClassStraddlingThePageBoundaryMovesWholeToTheNextPage() throws Exception {
        UUID a = createWod("A", true);
        UUID b = createWod("B", true);
        UUID c = createWod("C", true);
        for (int i = 1; i <= 17; i++) attach(seedSession(-3600L * i, "SCHEDULED"), a, b, c);

        JsonNode first = history(coachToken, "");
        assertThat(first.get("rows").size()).isEqualTo(48);

        JsonNode second = history(coachToken, "?before=" + first.get("nextBefore").asText());
        assertThat(second.get("rows").size()).isEqualTo(3);
        assertThat(second.get("nextBefore").isNull()).isTrue();
    }

    @Test
    void athleteIsForbidden() throws Exception {
        String athlete = tokenFor(boxId, "hist-ath-" + System.nanoTime() + "@t.io", "ATHLETE");
        mvc.perform(get("/api/box/wods/history").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    @Test
    void anotherBoxSeesNoneOfThisBoxsHistory() throws Exception {
        attach(seedSession(-3600, "SCHEDULED"), createWod("Grace", true));
        UUID other = newBox("Hist Other " + System.nanoTime(), "hist-o-" + System.nanoTime());
        String otherCoach = tokenFor(other, "hist-oc-" + System.nanoTime() + "@t.io", "COACH");
        assertThat(history(otherCoach, "").get("rows").size()).isZero();
    }
}
