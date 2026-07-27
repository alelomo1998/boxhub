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
    Box a, b;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        a = newBox("CT A " + n, "ct-a-" + n);
        b = newBox("CT B " + n, "ct-b-" + n);
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

    @Test
    void settingsPatchAppliesTimezoneAloneWithoutDisturbingOtherFields() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"cancelCutoffMin\":45,\"bookingHorizonWeeks\":2}"))
                .andExpect(status().isOk());

        // Timezone ONLY — every other field must survive untouched.
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"timezone\":\"America/New_York\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timezone").value("America/New_York"))
                .andExpect(jsonPath("$.cancelCutoffMin").value(45))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(2));
    }

    /**
     * BoxController.patchSettings maps a blank logoUrl to null (not to ""): see
     * {@code req.logoUrl().isBlank() ? null : req.logoUrl().trim()}. So the "clear" round trip
     * observes the field disappearing from the JSON (null), never an empty string.
     */
    @Test
    void settingsPatchCanClearTheLogoUrl() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"logoUrl\":\"https://example.test/logo.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoUrl").value("https://example.test/logo.png"));

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"logoUrl\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoUrl").doesNotExist());
    }

    /**
     * Since M11 T4 the stored imagePath is minted into a signed nginx secure_link URL, so an
     * unvalidated path is a capability to read someone else's file: box A's admin could store box
     * B's media path and have us sign it for them. Own-box path must round-trip (and come back
     * signed), foreign-box path must be refused. The second half fails against the unguarded
     * version — it returned 200 and a valid signature over box B's file.
     */
    @Test
    void templateImageMustBeThisBoxsOwnMediaPath() throws Exception {
        String id = om.readTree(mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                                .header("Authorization", "Bearer " + adminToken)
                                .content("{\"name\":\"Img\",\"weekday\":1,\"startTime\":\"07:00\",\"durationMin\":60,\"capacity\":10}"))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString())
                .get("id").asText();

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"imagePath\":\"/media/" + a.getId() + "/mine.jpg\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imagePath").value(org.hamcrest.Matchers.containsString("md5=")));

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"imagePath\":\"/media/" + b.getId() + "/theirs.jpg\"}"))
                .andExpect(status().isForbidden());
    }
}
