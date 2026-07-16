package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
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

class PlanApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    String adminToken, athleteToken, otherBoxAdminToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Plan Box A " + n, "plan-a-" + n);
        Box boxB = newBox("Plan Box B " + n, "plan-b-" + n);
        adminToken = boxToken("padm-" + n + "@t.io", boxA, "BOX_ADMIN");
        athleteToken = boxToken("path-" + n + "@t.io", boxA, "ATHLETE");
        otherBoxAdminToken = boxToken("padm2-" + n + "@t.io", boxB, "BOX_ADMIN");
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

    @Test
    void adminCreatesListsAndPatchesPlan() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Unlimited\",\"durationDays\":30}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Unlimited"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(get("/api/box/plans").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Unlimited"));

        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"durationDays\":45}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.durationDays").value(45));
    }

    @Test
    void duplicatePlanNameIs409() throws Exception {
        String body = "{\"name\":\"Dup Plan\",\"durationDays\":30}";
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + adminToken).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + adminToken).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void athleteCannotCreatePlan() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"Nope\",\"durationDays\":30}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Mine\",\"durationDays\":30}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        // other box's admin cannot even see it (tenant filter): 404, not 403 — no existence leak
        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherBoxAdminToken)
                        .content("{\"durationDays\":99}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void zeroDurationPatchIs400() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Valid Plan\",\"durationDays\":30}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"durationDays\":0}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void negativeWeeklyLimitOnCreateIs400() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Neg Limit\",\"durationDays\":30,\"weeklyClassLimit\":-1}"))
                .andExpect(status().isBadRequest());
    }
}
