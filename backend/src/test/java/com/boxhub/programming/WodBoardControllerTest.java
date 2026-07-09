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

import static org.hamcrest.Matchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WodBoardControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TrackService trackService;
    @Autowired ObjectMapper om;

    String coach, athlete, otherAthlete;
    LocalDate today = LocalDate.now();

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box boxA = newBox("Board Box A " + n, "brd-a-" + n);
        Box boxB = newBox("Board Box B " + n, "brd-b-" + n);
        trackService.seedDefaults(boxA.getId());
        coach = boxToken("bc-" + n + "@t.io", boxA, "COACH");
        athlete = boxToken("ba-" + n + "@t.io", boxA, "ATHLETE");
        otherAthlete = boxToken("ba2-" + n + "@t.io", boxB, "ATHLETE");

        // RX slot published, Fitness slot left as draft
        String body = mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        UUID rxId = UUID.fromString(om.readTree(body).get(0).get("id").asText());
        UUID fitId = UUID.fromString(om.readTree(body).get(1).get("id").asText());
        UUID rxWod = createWod("RX WOD");
        UUID fitWod = createWod("Fitness WOD");
        UUID rxSlot = assignSlot(rxId, rxWod);
        assignSlot(fitId, fitWod); // stays DRAFT
        mvc.perform(patch("/api/box/program/" + rxSlot).contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"));
    }

    private UUID createWod(String title) throws Exception {
        String body = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"title\":\"" + title + "\",\"wodType\":\"AMRAP\",\"scoreType\":\"ROUNDS_REPS\"}"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get("id").asText());
    }

    private UUID assignSlot(UUID track, UUID wod) throws Exception {
        String body = mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"slotDate\":\"" + today + "\",\"trackId\":\"" + track + "\",\"wodId\":\"" + wod + "\"}"))
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

    @Test
    void athleteSeesPublishedOnly() throws Exception {
        mvc.perform(get("/api/box/wod-board?date=" + today).header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks", hasSize(1)))
                .andExpect(jsonPath("$.tracks[0].wod.title").value("RX WOD"))
                .andExpect(jsonPath("$.tracks[*].wod.title", not(hasItem("Fitness WOD"))));
    }

    @Test
    void athleteCannotForceDrafts() throws Exception {
        // includeDrafts=true must be ignored for athletes
        mvc.perform(get("/api/box/wod-board?date=" + today + "&includeDrafts=true")
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks", hasSize(1)));
    }

    @Test
    void staffPreviewSeesDrafts() throws Exception {
        mvc.perform(get("/api/box/wod-board?date=" + today + "&includeDrafts=true")
                        .header("Authorization", "Bearer " + coach))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks", hasSize(2)))
                .andExpect(jsonPath("$.tracks[*].wod.title", hasItems("RX WOD", "Fitness WOD")));
    }

    @Test
    void otherBoxSeesNothing() throws Exception {
        mvc.perform(get("/api/box/wod-board?date=" + today).header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks", hasSize(0)));
    }
}
