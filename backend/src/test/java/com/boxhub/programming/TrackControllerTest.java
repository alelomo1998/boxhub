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

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TrackControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TrackService trackService;
    @Autowired ObjectMapper om;

    String adminToken, athleteToken, otherBoxAdminToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Track Box A " + n, "trk-a-" + n);
        Box boxB = newBox("Track Box B " + n, "trk-b-" + n);
        trackService.seedDefaults(boxA.getId()); // RX + Fitness, as box-create does
        trackService.seedDefaults(boxB.getId());
        adminToken = boxToken("tadm-" + n + "@t.io", boxA, "BOX_ADMIN");
        athleteToken = boxToken("tath-" + n + "@t.io", boxA, "ATHLETE");
        otherBoxAdminToken = boxToken("tadm2-" + n + "@t.io", boxB, "BOX_ADMIN");
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
    void seedsRxAndFitnessAndAdminAddsTrack() throws Exception {
        mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("RX"))
                .andExpect(jsonPath("$[1].name").value("Fitness"));

        mvc.perform(post("/api/box/tracks").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Masters\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Masters"))
                .andExpect(jsonPath("$.sortOrder").value(2));
    }

    @Test
    void athleteCannotCreateTrack() throws Exception {
        mvc.perform(post("/api/box/tracks").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"Nope\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        String body = mvc.perform(post("/api/box/tracks").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Mine\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(patch("/api/box/tracks/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherBoxAdminToken)
                        .content("{\"name\":\"Stolen\"}"))
                .andExpect(status().isNotFound());
    }
}
