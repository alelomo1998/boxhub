package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionItemApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired ObjectMapper om;

    String coach, athlete, otherCoach;
    UUID sessionId, wodA, wodB, boxAId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("Si A " + n, "si-a-" + n);
        Box b = newBox("Si B " + n, "si-b-" + n);
        coach = boxToken("sic-" + n + "@t.io", a, "COACH");
        athlete = boxToken("sia-" + n + "@t.io", a, "ATHLETE");
        otherCoach = boxToken("sio-" + n + "@t.io", b, "COACH");
        boxAId = a.getId();
        sessionId = newSession(boxAId);
        wodA = createWod("Warmup " + n, "WARMUP", "NONE");
        wodB = createWod("Metcon " + n, "FOR_TIME", "TIME");
    }

    private UUID newSession(UUID boxId) {
        actAsBox(boxId);
        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        SecurityContextHolder.clearContext();
        return s.getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String name, String slug) {
        Box x = new Box(); x.setName(name); x.setSlug(slug); x.setTimezone("Europe/Rome");
        return boxes.save(x);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private UUID createWod(String title, String type, String scoreType) throws Exception {
        String body = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"title\":\"" + title + "\",\"wodType\":\"" + type + "\",\"scoreType\":\"" + scoreType + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get("id").asText());
    }

    private String itemsJson(UUID... wodIds) {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < wodIds.length; i++) {
            if (i > 0) sb.append(',');
            boolean scoreable = i == wodIds.length - 1; // last piece scored, like a metcon finisher
            sb.append("{\"wodId\":\"").append(wodIds[i]).append("\",\"scoreable\":").append(scoreable).append('}');
        }
        return sb.append("]}").toString();
    }

    /** id == null means "new piece", matching ItemInput's nullable id contract. */
    private record Item(UUID id, UUID wodId, boolean scoreable) {}

    private String itemsWithIdsJson(Item... itemsArr) {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < itemsArr.length; i++) {
            if (i > 0) sb.append(',');
            Item it = itemsArr[i];
            sb.append('{');
            if (it.id() != null) sb.append("\"id\":\"").append(it.id()).append("\",");
            sb.append("\"wodId\":\"").append(it.wodId()).append("\",\"scoreable\":").append(it.scoreable());
            sb.append('}');
        }
        return sb.append("]}").toString();
    }

    private UUID itemIdAt(String responseBody, int idx) throws Exception {
        return UUID.fromString(om.readTree(responseBody).get(idx).get("id").asText());
    }

    /** An item is loggable only once its class instance's programming is PUBLISHED (ScoreService#loggableItem). */
    private void publish(UUID targetSessionId) throws Exception {
        mvc.perform(patch("/api/box/sessions/" + targetSessionId + "/programming").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());
    }

    private void logScore(UUID itemId) throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + itemId + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athlete)
                        .content("{\"rx\":true,\"timeSeconds\":600,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk());
    }

    private void assertScoreStillLogged(UUID itemId) throws Exception {
        mvc.perform(get("/api/box/sessions/items/" + itemId + "/score")
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk());
    }

    @Test
    void coachReplacesItemsAndPublishes() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].sortOrder").value(0))
                .andExpect(jsonPath("$[1].scoreable").value(true))
                .andExpect(jsonPath("$[1].scoreType").value("TIME")); // effective from FOR_TIME

        // replace with reversed order: no duplicates, new order wins
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodB, wodA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].wodId").value(wodB.toString()));

        mvc.perform(patch("/api/box/sessions/" + sessionId + "/programming").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.programmingStatus").value("PUBLISHED"));
    }

    @Test
    void draftProgrammingInvisibleToAthletes() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)));
        // athlete sees nothing while DRAFT
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        // coach preview sees drafts
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + coach))
                .andExpect(jsonPath("$.length()").value(2));
        // publish -> athlete sees items
        mvc.perform(patch("/api/box/sessions/" + sessionId + "/programming").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"));
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + athlete))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void athleteCannotWriteItems() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athlete).content(itemsJson(wodA)))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantSessionIs404() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherCoach).content("{\"items\":[]}"))
                .andExpect(status().isNotFound());
    }

    // --- M39: reconcile-by-id regression coverage -------------------------------------------

    @Test
    void reorderPreservesScoresAndIds() throws Exception {
        String body = mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idA = itemIdAt(body, 0);
        UUID idB = itemIdAt(body, 1); // scoreable: itemsJson scores only the last piece

        publish(sessionId);
        logScore(idB);

        // reorder: same two pieces, ids sent, order flipped
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idB, wodB, true), new Item(idA, wodA, false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(idB.toString()))
                .andExpect(jsonPath("$[0].sortOrder").value(0))
                .andExpect(jsonPath("$[1].id").value(idA.toString()))
                .andExpect(jsonPath("$[1].sortOrder").value(1));

        // the score survived, and it still points at the same session_item id
        assertScoreStillLogged(idB);
    }

    /**
     * The ordinary edit. instance-builder's ensureWod() mints a BRAND-NEW wod whenever a piece's
     * title, body or type changed, so "edit this piece's text and save" reaches the server as the
     * same item id pointing at a different wodId. That must succeed and keep the row.
     */
    @Test
    void editingAnUnscoredPieceRebindsItsWodAndKeepsTheRow() throws Exception {
        String body = mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idA = itemIdAt(body, 0);
        UUID idB = itemIdAt(body, 1);

        UUID editedA = createWod("Warmup edited " + System.nanoTime(), "WARMUP", "NONE");

        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idA, editedA, false), new Item(idB, wodB, true))))
                .andExpect(status().isOk())
                // same row, now pointing at the edited wod
                .andExpect(jsonPath("$[0].id").value(idA.toString()))
                .andExpect(jsonPath("$[0].wodId").value(editedA.toString()));
    }

    /**
     * The same edit, once results exist: those were logged against the OLD workout, so re-pointing
     * the row would silently reattribute them. Reject rather than rewrite history.
     */
    @Test
    void changingTheWodOfAScoredPieceIsRejectedWith409() throws Exception {
        String body = mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idA = itemIdAt(body, 0);
        UUID idB = itemIdAt(body, 1);

        publish(sessionId);
        logScore(idB);

        UUID editedB = createWod("Metcon edited " + System.nanoTime(), "FOR_TIME", "TIME");

        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idA, wodA, false), new Item(idB, editedB, true))))
                .andExpect(status().isConflict());

        assertScoreStillLogged(idB);
    }

    @Test
    void removingScoredPieceIsRejectedWith409() throws Exception {
        String body = mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idA = itemIdAt(body, 0);
        UUID idB = itemIdAt(body, 1);
        publish(sessionId);
        logScore(idB);

        // drop idB (the scored piece) -> rejected, nothing changes
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idA, wodA, false))))
                .andExpect(status().isConflict());

        assertScoreStillLogged(idB);
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + coach))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void removingUnscoredPieceSucceeds() throws Exception {
        String body = mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idA = itemIdAt(body, 0);

        // no score logged on either piece; drop idB
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idA, wodA, false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(idA.toString()));
    }

    @Test
    void addingNewPieceKeepsExistingIdsStable() throws Exception {
        String body = mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idA = itemIdAt(body, 0);

        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idA, wodA, false), new Item(null, wodB, true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(idA.toString()))
                .andExpect(jsonPath("$[1].id").value(org.hamcrest.Matchers.not(idA.toString())))
                .andExpect(jsonPath("$[1].wodId").value(wodB.toString()));
    }

    @Test
    void unknownItemIdIs400() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA)))
                .andExpect(status().isOk());

        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(UUID.randomUUID(), wodA, false))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void itemIdFromAnotherSessionIs400() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA)))
                .andExpect(status().isOk());

        UUID otherSessionId = newSession(boxAId);
        String otherBody = mvc.perform(put("/api/box/sessions/" + otherSessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodB)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID idFromOtherSession = itemIdAt(otherBody, 0);

        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content(itemsWithIdsJson(new Item(idFromOtherSession, wodA, false))))
                .andExpect(status().isBadRequest());
    }
}
