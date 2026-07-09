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

class LeaderboardApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TrackService trackService;
    @Autowired ObjectMapper om;

    String coach, athleteA, athleteB, otherAthlete;
    String slot;

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("Lb A " + n, "lb-a-" + n);
        Box b = newBox("Lb B " + n, "lb-b-" + n);
        trackService.seedDefaults(a.getId());
        coach = boxToken("lbc-" + n + "@t.io", a, "COACH");
        athleteA = boxToken("lba-" + n + "@t.io", a, "ATHLETE");
        athleteB = boxToken("lbb-" + n + "@t.io", a, "ATHLETE");
        otherAthlete = boxToken("lbo-" + n + "@t.io", b, "ATHLETE");

        String tracks = mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        UUID rx = UUID.fromString(om.readTree(tracks).get(0).get("id").asText());
        String wodBody = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"title\":\"Grace\",\"wodType\":\"FOR_TIME\",\"scoreType\":\"TIME\"}"))
                .andReturn().getResponse().getContentAsString();
        UUID wod = UUID.fromString(om.readTree(wodBody).get("id").asText());
        String slotBody = mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"slotDate\":\"" + LocalDate.now() + "\",\"trackId\":\"" + rx + "\",\"wodId\":\"" + wod + "\"}"))
                .andReturn().getResponse().getContentAsString();
        slot = om.readTree(slotBody).get("id").asText();
        mvc.perform(patch("/api/box/program/" + slot).contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"));
    }

    private Box newBox(String name, String slug) {
        Box x = new Box(); x.setName(name); x.setSlug(slug); x.setTimezone("Europe/Rome");
        return boxes.save(x);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private void logTime(String token, int seconds) throws Exception {
        mvc.perform(put("/api/box/program/" + slot + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + token)
                .content("{\"rx\":true,\"timeSeconds\":" + seconds + ",\"finished\":true,\"isPrivate\":false}"));
    }

    @Test
    void leaderboardRanksByTimeAscending() throws Exception {
        logTime(athleteA, 200);
        logTime(athleteB, 150);
        mvc.perform(get("/api/box/program/" + slot + "/leaderboard").header("Authorization", "Bearer " + athleteA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scoreType").value("TIME"))
                .andExpect(jsonPath("$.entries[0].rank").value(1))
                .andExpect(jsonPath("$.entries[0].timeSeconds").value(150))
                .andExpect(jsonPath("$.entries[1].timeSeconds").value(200));
    }

    @Test
    void crossTenantLeaderboardIs404() throws Exception {
        mvc.perform(get("/api/box/program/" + slot + "/leaderboard").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNotFound());
    }
}
