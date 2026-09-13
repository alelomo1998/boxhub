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

import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MovementControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired MovementRepository movements;
    @Autowired ObjectMapper om;

    String aAdmin, aCoach, aAthlete, bAdmin;
    String globalName;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Mv Box A " + n, "mvc-a-" + n);
        Box boxB = newBox("Mv Box B " + n, "mvc-b-" + n);
        aAdmin = boxToken("mva-" + n + "@t.io", boxA, "BOX_ADMIN");
        aCoach = boxToken("mvcoach-" + n + "@t.io", boxA, "COACH");
        aAthlete = boxToken("mvath-" + n + "@t.io", boxA, "ATHLETE");
        bAdmin = boxToken("mvb-" + n + "@t.io", boxB, "BOX_ADMIN");
        globalName = "Global Snatch " + n;
        Movement g = new Movement();
        g.setName(globalName);
        g.setCategory("BARBELL");
        movements.save(g); // global (box_id null)
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
    void globalVisibleToBothBoxesCustomIsBoxScoped() throws Exception {
        // box A creates a custom movement
        String body = mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"A Custom Lift\",\"category\":\"BARBELL\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String customId = om.readTree(body).get("id").asText();

        // global visible to A and B; A's custom visible to A, NOT B
        mvc.perform(get("/api/box/movements").header("Authorization", "Bearer " + aAdmin))
                .andExpect(jsonPath("$[*].name", hasItems(globalName, "A Custom Lift")));
        mvc.perform(get("/api/box/movements").header("Authorization", "Bearer " + bAdmin))
                .andExpect(jsonPath("$[*].name", hasItem(globalName)))
                .andExpect(jsonPath("$[*].name", not(hasItem("A Custom Lift"))));

        // box B cannot patch box A's custom movement -> 404 (no leak)
        mvc.perform(patch("/api/box/movements/" + customId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + bAdmin)
                        .content("{\"name\":\"Stolen\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void globalMovementIsImmutable() throws Exception {
        UUID globalId = movements.findAll().stream()
                .filter(m -> m.getName().equals(globalName)).findFirst().orElseThrow().getId();
        mvc.perform(patch("/api/box/movements/" + globalId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"Hijack\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void athleteCannotCreateMovement() throws Exception {
        mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAthlete)
                        .content("{\"name\":\"Nope\",\"category\":\"OTHER\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void coachCanCreateMovement() throws Exception {
        mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aCoach)
                        .content("{\"name\":\"Coach Added Lift\",\"category\":\"BARBELL\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name", is("Coach Added Lift")));
    }

    @Test
    void coachCannotPatchMovement() throws Exception {
        String body = mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"Coach Patch Target\",\"category\":\"BARBELL\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(patch("/api/box/movements/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aCoach)
                        .content("{\"name\":\"Renamed\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void unitsAndLoadableRoundTrip() throws Exception {
        mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"Bike Test\",\"category\":\"MONOSTRUCTURAL\","
                                + "\"units\":[\"CAL\",\"M\"],\"loadable\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.units", contains("CAL", "M")))
                .andExpect(jsonPath("$.loadable", is(true)));
    }

    @Test
    void missingUnitsDefaultsToReps() throws Exception {
        mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"No Units Test\",\"category\":\"BARBELL\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.units", contains("REPS")))
                .andExpect(jsonPath("$.loadable", is(false)));
    }

    @Test
    void unknownUnitIs400() throws Exception {
        mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"Bad Unit Test\",\"category\":\"BARBELL\",\"units\":[\"BANANAS\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("MOVEMENT_UNIT")));
    }

    @Test
    void emptyUnitsListIs400() throws Exception {
        mvc.perform(post("/api/box/movements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aAdmin)
                        .content("{\"name\":\"Empty Unit Test\",\"category\":\"BARBELL\",\"units\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(content().string(containsString("MOVEMENT_UNIT")));
    }
}
