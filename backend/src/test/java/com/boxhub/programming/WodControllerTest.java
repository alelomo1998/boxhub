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

class WodControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    String coachToken, athleteToken, otherBoxCoach;

    private static final String FRAN = """
            {"title":"Fran","wodType":"FOR_TIME","scoreType":"TIME","timeCapSeconds":600,
             "blocks":{"blocks":[{"label":"For Time","note":"21-15-9",
               "lines":[{"text":"Thrusters 95/65","reps":"21-15-9","load":"95/65"},
                        {"text":"Pull-ups","reps":"21-15-9"}]}]}}""";

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Wod Box A " + n, "wod-a-" + n);
        Box boxB = newBox("Wod Box B " + n, "wod-b-" + n);
        coachToken = boxToken("wc-" + n + "@t.io", boxA, "COACH");
        athleteToken = boxToken("wa-" + n + "@t.io", boxA, "ATHLETE");
        otherBoxCoach = boxToken("wc2-" + n + "@t.io", boxB, "COACH");
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

    private String createFran() throws Exception {
        String body = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken).content(FRAN))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Fran"))
                .andExpect(jsonPath("$.blocks.blocks[0].lines[0].reps").value("21-15-9"))
                .andReturn().getResponse().getContentAsString();
        return om.readTree(body).get("id").asText();
    }

    @Test
    void coachCreatesGetsAndPatchesWod() throws Exception {
        String id = createFran();
        mvc.perform(get("/api/box/wods/" + id).header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.wodType").value("FOR_TIME"));
        mvc.perform(patch("/api/box/wods/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"title\":\"Fran Retest\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Fran Retest"));
    }

    @Test
    void duplicateProducesIndependentCopy() throws Exception {
        String id = createFran();
        mvc.perform(post("/api/box/wods/" + id + "/duplicate").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Fran (copy)"))
                .andExpect(jsonPath("$.blocks.blocks[0].lines[1].text").value("Pull-ups"));
    }

    @Test
    void deleteUnreferencedWod() throws Exception {
        String id = createFran();
        mvc.perform(delete("/api/box/wods/" + id).header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isNoContent());
    }

    @Test
    void athleteCannotCreateWod() throws Exception {
        mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken).content(FRAN))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantGetIs404() throws Exception {
        String id = createFran();
        mvc.perform(get("/api/box/wods/" + id).header("Authorization", "Bearer " + otherBoxCoach))
                .andExpect(status().isNotFound());
    }
}
