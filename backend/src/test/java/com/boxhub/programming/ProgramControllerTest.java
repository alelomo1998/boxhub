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
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProgramControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TrackService trackService;
    @Autowired ObjectMapper om;

    String coach, athlete, otherCoach;
    UUID rxId, wodId;
    LocalDate today = LocalDate.now();

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box boxA = newBox("Prog Box A " + n, "prg-a-" + n);
        Box boxB = newBox("Prog Box B " + n, "prg-b-" + n);
        trackService.seedDefaults(boxA.getId());
        coach = boxToken("pc-" + n + "@t.io", boxA, "COACH");
        athlete = boxToken("pa-" + n + "@t.io", boxA, "ATHLETE");
        otherCoach = boxToken("pc2-" + n + "@t.io", boxB, "COACH");
        rxId = firstTrackId(coach);
        wodId = createWod(coach, "Cindy");
    }

    private UUID firstTrackId(String token) throws Exception {
        String body = mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get(0).get("id").asText());
    }

    private UUID createWod(String token, String title) throws Exception {
        String body = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content("{\"title\":\"" + title + "\",\"wodType\":\"AMRAP\",\"scoreType\":\"ROUNDS_REPS\"}"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get("id").asText());
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private String assign(String token, UUID track, UUID wod) throws Exception {
        return mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content("{\"slotDate\":\"" + today + "\",\"trackId\":\"" + track + "\",\"wodId\":\"" + wod + "\"}"))
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void assignUpsertsSlotAndPublishes() throws Exception {
        String body = mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"slotDate\":\"" + today + "\",\"trackId\":\"" + rxId + "\",\"wodId\":\"" + wodId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.wodTitle").value("Cindy"))
                .andReturn().getResponse().getContentAsString();
        UUID slotId = UUID.fromString(om.readTree(body).get("id").asText());

        // re-assign a different WOD to the same (date,track): updates, no duplicate
        UUID wod2 = createWod(coach, "Fran");
        String body2 = assign(coach, rxId, wod2);
        assertSameSlot(slotId, body2);

        // publish
        mvc.perform(patch("/api/box/program/" + slotId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    private void assertSameSlot(UUID slotId, String body) throws Exception {
        org.assertj.core.api.Assertions.assertThat(om.readTree(body).get("id").asText()).isEqualTo(slotId.toString());
        org.assertj.core.api.Assertions.assertThat(om.readTree(body).get("wodTitle").asText()).isEqualTo("Fran");
    }

    @Test
    void bulkPublishCountsAndDeleteClears() throws Exception {
        String body = assign(coach, rxId, wodId);
        UUID slotId = UUID.fromString(om.readTree(body).get("id").asText());
        mvc.perform(post("/api/box/program/publish").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"from\":\"" + today + "\",\"to\":\"" + today + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(1));
        mvc.perform(delete("/api/box/program/" + slotId).header("Authorization", "Bearer " + coach))
                .andExpect(status().isNoContent());
    }

    @Test
    void assignForeignTrackIs404() throws Exception {
        mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"slotDate\":\"" + today + "\",\"trackId\":\"" + UUID.randomUUID() + "\",\"wodId\":\"" + wodId + "\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void athleteCannotAssign() throws Exception {
        mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athlete)
                        .content("{\"slotDate\":\"" + today + "\",\"trackId\":\"" + rxId + "\",\"wodId\":\"" + wodId + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        String body = assign(coach, rxId, wodId);
        UUID slotId = UUID.fromString(om.readTree(body).get("id").asText());
        mvc.perform(patch("/api/box/program/" + slotId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherCoach)
                        .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isNotFound());
    }
}
