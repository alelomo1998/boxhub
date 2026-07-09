package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.boxhub.programming.TrackService;
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

class ScoreControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TrackService trackService;
    @Autowired ObjectMapper om;

    String coach, athleteA, athleteB, otherAthlete;
    String publishedSlot, draftSlot;
    LocalDate today = LocalDate.now();

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box boxA = newBox("Score A " + n, "sc-a-" + n);
        Box boxB = newBox("Score B " + n, "sc-b-" + n);
        trackService.seedDefaults(boxA.getId());
        coach = boxToken("scc-" + n + "@t.io", boxA, "COACH");
        athleteA = boxToken("sca-" + n + "@t.io", boxA, "ATHLETE");
        athleteB = boxToken("scb-" + n + "@t.io", boxA, "ATHLETE");
        otherAthlete = boxToken("sco-" + n + "@t.io", boxB, "ATHLETE");

        String tracks = mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        UUID rx = UUID.fromString(om.readTree(tracks).get(0).get("id").asText());
        UUID fit = UUID.fromString(om.readTree(tracks).get(1).get("id").asText());
        UUID wod = createWod("Fran");
        publishedSlot = assign(rx, wod);
        mvc.perform(patch("/api/box/program/" + publishedSlot).contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"));
        draftSlot = assign(fit, wod); // left DRAFT
    }

    private UUID createWod(String title) throws Exception {
        String body = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"title\":\"" + title + "\",\"wodType\":\"FOR_TIME\",\"scoreType\":\"TIME\"}"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get("id").asText());
    }

    private String assign(UUID track, UUID wod) throws Exception {
        String body = mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"slotDate\":\"" + today + "\",\"trackId\":\"" + track + "\",\"wodId\":\"" + wod + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return om.readTree(body).get("id").asText();
    }

    private Box newBox(String name, String slug) {
        Box b = new Box(); b.setName(name); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void athleteLogsAndEditsOwnScore() throws Exception {
        mvc.perform(put("/api/box/program/" + publishedSlot + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"rx\":true,\"timeSeconds\":183,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(183))
                .andExpect(jsonPath("$.scoreType").value("TIME"));
        // edit
        mvc.perform(put("/api/box/program/" + publishedSlot + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"rx\":true,\"timeSeconds\":170,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(170));
        mvc.perform(get("/api/box/program/" + publishedSlot + "/score").header("Authorization", "Bearer " + athleteA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(170));
    }

    @Test
    void scoresArePerAthleteAndPrivate() throws Exception {
        mvc.perform(put("/api/box/program/" + publishedSlot + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteA).content("{\"rx\":true,\"timeSeconds\":183,\"isPrivate\":false}"));
        mvc.perform(put("/api/box/program/" + publishedSlot + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteB).content("{\"rx\":false,\"timeSeconds\":240,\"isPrivate\":false}"));
        // each reads only their own
        mvc.perform(get("/api/box/program/" + publishedSlot + "/score").header("Authorization", "Bearer " + athleteA))
                .andExpect(jsonPath("$.timeSeconds").value(183));
        mvc.perform(get("/api/box/program/" + publishedSlot + "/score").header("Authorization", "Bearer " + athleteB))
                .andExpect(jsonPath("$.timeSeconds").value(240));
    }

    @Test
    void cannotScoreDraftSlot() throws Exception {
        mvc.perform(put("/api/box/program/" + draftSlot + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA).content("{\"rx\":true,\"timeSeconds\":183}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void cannotScoreForeignSlot() throws Exception {
        mvc.perform(put("/api/box/program/" + publishedSlot + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherAthlete).content("{\"rx\":true,\"timeSeconds\":183}"))
                .andExpect(status().isNotFound());
    }
}
