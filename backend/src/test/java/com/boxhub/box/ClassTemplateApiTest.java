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

class ClassTemplateApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    String adminToken, athleteToken, otherAdminToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("CT A " + n, "ct-a-" + n);
        Box b = newBox("CT B " + n, "ct-b-" + n);
        adminToken = boxToken("cta-" + n + "@t.io", a, "BOX_ADMIN");
        athleteToken = boxToken("ctath-" + n + "@t.io", a, "ATHLETE");
        otherAdminToken = boxToken("ctb-" + n + "@t.io", b, "BOX_ADMIN");
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void adminCreatesListsPatchesTemplate() throws Exception {
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"WOD 06:00\",\"weekday\":0,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("WOD 06:00"))
                .andExpect(jsonPath("$.weekday").value(0))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(get("/api/box/class-templates").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("WOD 06:00"));

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"capacity\":15,\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capacity").value(15))
                .andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void athleteCannotCreate() throws Exception {
        mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"X\",\"weekday\":0,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidWeekdayIs400() throws Exception {
        mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"X\",\"weekday\":9,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Mine\",\"weekday\":1,\"startTime\":\"18:00\",\"durationMin\":60,\"capacity\":10}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherAdminToken)
                        .content("{\"capacity\":99}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void settingsPatchRoundTripsBookingFields() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"cancelCutoffMin\":90,\"bookingHorizonWeeks\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelCutoffMin").value(90))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(3));

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.cancelCutoffMin").value(90))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(3));
    }
}
