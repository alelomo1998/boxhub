package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SkeletonApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    String coach, athlete, otherCoach;
    UUID templateId;

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("Sk A " + n, "sk-a-" + n);
        Box b = newBox("Sk B " + n, "sk-b-" + n);
        coach = boxToken("skc-" + n + "@t.io", a, "COACH");
        athlete = boxToken("ska-" + n + "@t.io", a, "ATHLETE");
        otherCoach = boxToken("sko-" + n + "@t.io", b, "COACH");
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"name\":\"Muscle Class\",\"weekday\":0,\"startTime\":\"18:00\",\"durationMin\":60,\"capacity\":12}"))
                .andReturn().getResponse().getContentAsString();
        templateId = UUID.fromString(om.readTree(body).get("id").asText());
    }

    private Box newBox(String name, String slug) {
        Box x = new Box(); x.setName(name); x.setSlug(slug); x.setTimezone("Europe/Rome");
        return boxes.save(x);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void coachDefinesAndReordersSkeleton() throws Exception {
        String skel = "{\"pieces\":[{\"label\":\"Warm-up\",\"wodType\":\"WARMUP\"}," +
                "{\"label\":\"Strength circuit 1\",\"wodType\":\"STRENGTH\"}," +
                "{\"label\":\"Stretching\",\"wodType\":\"SKILL\"}]}";
        mvc.perform(put("/api/box/class-templates/" + templateId + "/skeleton").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(skel))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].label").value("Warm-up"))
                // SKILL composes back as GYMNASTIC (macro-only, no timing preset to recover SKILL
                // from) — the M14a orchestrator's accepted lossy wodType round-trip, not a bug.
                .andExpect(jsonPath("$[2].wodType").value("GYMNASTIC"));

        mvc.perform(get("/api/box/class-templates/" + templateId + "/skeleton")
                        .header("Authorization", "Bearer " + coach))
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    void unknownPieceTypeIs400() throws Exception {
        mvc.perform(put("/api/box/class-templates/" + templateId + "/skeleton").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"pieces\":[{\"label\":\"X\",\"wodType\":\"NOPE\"}]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void athleteCannotTouchSkeleton() throws Exception {
        mvc.perform(get("/api/box/class-templates/" + templateId + "/skeleton")
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantTemplateIs404() throws Exception {
        mvc.perform(put("/api/box/class-templates/" + templateId + "/skeleton").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherCoach).content("{\"pieces\":[]}"))
                .andExpect(status().isNotFound());
    }
}
