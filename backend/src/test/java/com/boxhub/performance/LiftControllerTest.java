package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.boxhub.programming.Movement;
import com.boxhub.programming.MovementRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LiftControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired MovementRepository movements;
    @Autowired ObjectMapper om;

    String athleteA, otherAthlete;
    UUID globalMovement, boxBCustomMovement;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Lift A " + n, "lift-a-" + n);
        Box b = newBox("Lift B " + n, "lift-b-" + n);
        athleteA = boxToken("lfa-" + n + "@t.io", a, "ATHLETE");
        otherAthlete = boxToken("lfo-" + n + "@t.io", b, "ATHLETE");
        globalMovement = movement(null, "Global Squat " + n);
        boxBCustomMovement = movement(b.getId(), "B Only Lift " + n);
    }

    private UUID movement(UUID boxId, String name) {
        Movement m = new Movement(); m.setBoxId(boxId); m.setName(name); m.setCategory("BARBELL");
        return movements.save(m).getId();
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

    private void log(String token, UUID mv, String load) throws Exception {
        mvc.perform(post("/api/box/lifts").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content("{\"movementId\":\"" + mv + "\",\"load\":" + load + ",\"reps\":1}"))
                .andExpect(status().isCreated());
    }

    @Test
    void autoPrDetection() throws Exception {
        // first entry is a PR
        mvc.perform(post("/api/box/lifts").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"movementId\":\"" + globalMovement + "\",\"load\":100,\"reps\":1}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.isPr").value(true));
        // heavier is a PR
        mvc.perform(post("/api/box/lifts").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"movementId\":\"" + globalMovement + "\",\"load\":120,\"reps\":1}"))
                .andExpect(jsonPath("$.isPr").value(true));
        // equal or lighter is NOT
        mvc.perform(post("/api/box/lifts").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"movementId\":\"" + globalMovement + "\",\"load\":120,\"reps\":1}"))
                .andExpect(jsonPath("$.isPr").value(false));
    }

    @Test
    void progressionAndPrs() throws Exception {
        log(athleteA, globalMovement, "100");
        log(athleteA, globalMovement, "115");
        mvc.perform(get("/api/box/lifts?movementId=" + globalMovement).header("Authorization", "Bearer " + athleteA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/box/lifts/prs").header("Authorization", "Bearer " + athleteA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].load").value(115.0));
    }

    @Test
    void cannotLogMovementFromAnotherBox() throws Exception {
        mvc.perform(post("/api/box/lifts").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"movementId\":\"" + boxBCustomMovement + "\",\"load\":100,\"reps\":1}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void liftsAreBoxScoped() throws Exception {
        log(athleteA, globalMovement, "100");
        // box B athlete sees none of A's lifts (own membership only)
        mvc.perform(get("/api/box/lifts/prs").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
