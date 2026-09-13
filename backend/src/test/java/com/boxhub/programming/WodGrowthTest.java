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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * THE HEADLINE CLAIM OF M14c-a: the wod table stops growing.
 *
 * <p>Before this milestone, instance-builder's ensureWod() minted a fresh library wod on every
 * edited re-save, so the library grew without bound. A piece is now COPIED out of the library once,
 * the class owns that copy, and every later edit patches it — so no save path mints a wod row.
 *
 * <p>Same MockMvc + coach-JWT harness as WodAxesWireTest and WodLibraryListTest. Repository reads
 * run inside TenantContext.runAsBox: Wod is @TenantId and since M21 a tenant-less read fails CLOSED,
 * so counting from a bare test thread would return 0 and every assertion here would pass vacuously.
 */
class WodGrowthTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired WodRepository wodRepo;
    @Autowired ObjectMapper om;

    UUID boxId;
    String coachToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxId = newBox("Growth " + n, "growth-" + n);
        coachToken = coachTokenFor(boxId, "growth-" + n + "@t.io");
    }

    private UUID newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private String coachTokenFor(UUID box, String email) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(box).orElseThrow());
        m.setRole("COACH");
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private UUID seedSession() {
        return TenantContext.runAsBox(boxId, () -> {
            ClassSession s = new ClassSession();
            s.setName("WOD Class");
            s.setStartAt(Instant.now().plusSeconds(3600));
            s.setDurationMin(60);
            s.setCapacity(12);
            return sessions.save(s).getId();
        });
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

    private static String newPiece(UUID wodId) {
        return "{\"wodId\":\"" + wodId + "\",\"scoreable\":false}";
    }

    private static String existingPiece(UUID itemId, UUID wodId) {
        return "{\"id\":\"" + itemId + "\",\"wodId\":\"" + wodId + "\",\"scoreable\":false}";
    }

    private void putItems(UUID sessionId, String... itemJson) throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[" + String.join(",", itemJson) + "]}"))
                .andExpect(status().isOk());
    }

    private JsonNode firstItem(UUID sessionId) throws Exception {
        String json = mvc.perform(get("/api/box/sessions/" + sessionId + "/items")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readTree(json).get(0);
    }

    private void patchWod(UUID wodId, String title, boolean saveToLibrary) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        if (saveToLibrary) body.put("saveToLibrary", true);
        mvc.perform(patch("/api/box/wods/" + wodId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    private long wodCount() {
        return TenantContext.runAsBox(boxId, () -> wodRepo.count());
    }

    private Wod wod(UUID id) {
        return TenantContext.runAsBox(boxId, () -> wodRepo.findById(id).orElseThrow());
    }

    // --- the growth fix ---------------------------------------------------------------------

    /**
     * THE HEADLINE ASSERTION OF M14c-a. Editing a piece and saving three times must leave the wod
     * row count unchanged. If this ever fails, someone has regressed copy-on-attach or reintroduced
     * a save path that mints a wod.
     */
    @Test
    void editingAndResavingAPieceCreatesNoNewWodRows() throws Exception {
        UUID session = seedSession();
        UUID libraryWod = createWod("Fran", true);

        // attaching from the library DOES create exactly one row: the class's own copy
        putItems(session, fromLibrary(libraryWod));
        long afterAttach = wodCount();

        JsonNode item = firstItem(session);
        UUID itemId = UUID.fromString(item.get("id").asText());
        UUID copyId = UUID.fromString(item.get("wodId").asText());

        for (String title : List.of("Fran A", "Fran B", "Fran C")) {
            patchWod(copyId, title, false);
            putItems(session, existingPiece(itemId, copyId));
        }

        assertThat(wodCount()).isEqualTo(afterAttach);
    }

    @Test
    void attachingFromTheLibraryCopiesRatherThanSharing() throws Exception {
        UUID session = seedSession();
        UUID libraryWod = createWod("Cindy", true);
        putItems(session, fromLibrary(libraryWod));

        UUID copyId = UUID.fromString(firstItem(session).get("wodId").asText());
        assertThat(copyId).isNotEqualTo(libraryWod);

        Wod copy = wod(copyId);
        assertThat(copy.isLibrary()).isFalse();
        assertThat(copy.getSourceWodId()).isEqualTo(libraryWod);
        assertThat(copy.getTitle()).isEqualTo("Cindy");
    }

    /** Editing the class's copy must never rewrite what the library says. */
    @Test
    void editingTheCopyLeavesTheLibraryEntryAlone() throws Exception {
        UUID session = seedSession();
        UUID libraryWod = createWod("Helen", true);
        putItems(session, fromLibrary(libraryWod));

        UUID copyId = UUID.fromString(firstItem(session).get("wodId").asText());
        patchWod(copyId, "Helen, shortened", false);

        assertThat(wod(libraryWod).getTitle()).isEqualTo("Helen");
    }

    // --- save to library, with provenance ---------------------------------------------------

    /**
     * Tour decision 4: "re-saving an edited local block updates in place". The second save must
     * update the row the first one created, not add a second.
     */
    @Test
    void savingToTheLibraryTwiceUpdatesOneRow() throws Exception {
        UUID session = seedSession();
        UUID local = createWod("Custom piece", false);
        putItems(session, newPiece(local));

        patchWod(local, "Custom piece v1", true);
        long afterFirst = wodCount();
        UUID sourceId = wod(local).getSourceWodId();
        assertThat(sourceId).isNotNull();
        assertThat(wod(sourceId).isLibrary()).isTrue();

        patchWod(local, "Custom piece v2", true);

        assertThat(wodCount()).isEqualTo(afterFirst);
        assertThat(wod(local).getSourceWodId()).isEqualTo(sourceId);
        assertThat(wod(sourceId).getTitle()).isEqualTo("Custom piece v2");
    }

    /** Default off: an ordinary edit must not put the piece in the library. */
    @Test
    void anOrdinaryEditDoesNotTouchTheLibrary() throws Exception {
        UUID session = seedSession();
        UUID local = createWod("Local only", false);
        putItems(session, newPiece(local));

        patchWod(local, "Local only, edited", false);

        Wod copy = wod(local);
        assertThat(copy.isLibrary()).isFalse();
        assertThat(copy.getSourceWodId()).isNull();
    }

    // --- the new input, guarded -------------------------------------------------------------

    /** Exactly one of the two: neither is a UI slip, both is ambiguous about what the class owns. */
    @Test
    void neitherWodIdNorFromLibraryWodIdIs400() throws Exception {
        UUID session = seedSession();
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[{\"scoreable\":false}]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void bothWodIdAndFromLibraryWodIdIs400() throws Exception {
        UUID session = seedSession();
        UUID libraryWod = createWod("Diane", true);
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[{\"wodId\":\"" + libraryWod + "\",\"fromLibraryWodId\":\""
                                + libraryWod + "\",\"scoreable\":false}]}"))
                .andExpect(status().isBadRequest());
    }

    /** An existing item already owns its copy; re-attaching from the library would orphan it. */
    @Test
    void attachingFromTheLibraryOntoAnExistingItemIs400() throws Exception {
        UUID session = seedSession();
        UUID libraryWod = createWod("Grace", true);
        putItems(session, fromLibrary(libraryWod));
        UUID itemId = UUID.fromString(firstItem(session).get("id").asText());

        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[{\"id\":\"" + itemId + "\",\"fromLibraryWodId\":\""
                                + libraryWod + "\",\"scoreable\":false}]}"))
                .andExpect(status().isBadRequest());
    }

    /** Tenant-filtered read -> a foreign library id simply does not exist, so 404, not a leak. */
    @Test
    void attachingAnotherBoxesLibraryWodIs404() throws Exception {
        long n = System.nanoTime();
        UUID otherBox = newBox("Growth other " + n, "growth-other-" + n);
        String otherCoach = coachTokenFor(otherBox, "growth-other-" + n + "@t.io");
        UUID foreignWod = createWod(otherCoach, "Foreign Fran", true);

        UUID session = seedSession();
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[" + fromLibrary(foreignWod) + "]}"))
                .andExpect(status().isNotFound());
    }

    // --- fromBenchmarkId ----------------------------------------------------------------------

    private UUID aBenchmarkId() throws Exception {
        String json = mvc.perform(get("/api/box/benchmarks").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(json).get(0).get("id").asText());
    }

    private static String fromBenchmark(UUID benchmarkId) {
        return "{\"fromBenchmarkId\":\"" + benchmarkId + "\",\"scoreable\":true}";
    }

    /** D7: a benchmark picked into a class becomes the class's own copy, never a library row. */
    @Test
    void attachingABenchmarkCopiesIntoTheClassWithProvenance() throws Exception {
        UUID session = seedSession();
        UUID benchmark = aBenchmarkId();
        long libraryRows = TenantContext.runAsBox(boxId, () -> wodRepo.findByLibraryTrueOrderByUpdatedAtDesc().size());

        putItems(session, fromBenchmark(benchmark));

        Wod copy = wod(UUID.fromString(firstItem(session).get("wodId").asText()));
        assertThat(copy.isLibrary()).isFalse();
        assertThat(copy.getBenchmarkTemplateId()).isEqualTo(benchmark);
        assertThat(copy.getSourceWodId()).isNull();
        assertThat(TenantContext.runAsBox(boxId, () -> wodRepo.findByLibraryTrueOrderByUpdatedAtDesc().size()))
                .isEqualTo(libraryRows);
    }

    @Test
    void libraryAndBenchmarkSourcesTogetherIs400() throws Exception {
        UUID session = seedSession();
        UUID libraryWod = createWod("Diane", true);
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[{\"fromLibraryWodId\":\"" + libraryWod + "\",\"fromBenchmarkId\":\""
                                + aBenchmarkId() + "\",\"scoreable\":false}]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownBenchmarkIs404() throws Exception {
        UUID session = seedSession();
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[" + fromBenchmark(UUID.randomUUID()) + "]}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void anExistingItemCannotTakeABenchmarkSource() throws Exception {
        UUID session = seedSession();
        putItems(session, fromBenchmark(aBenchmarkId()));
        UUID itemId = UUID.fromString(firstItem(session).get("id").asText());
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[{\"id\":\"" + itemId + "\",\"fromBenchmarkId\":\"" + aBenchmarkId()
                                + "\",\"scoreable\":false}]}"))
                .andExpect(status().isBadRequest());
    }
}
