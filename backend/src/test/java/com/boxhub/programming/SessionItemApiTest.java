package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionItemApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired ObjectMapper om;

    String coach, athlete, otherCoach;
    UUID sessionId, wodA, wodB;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("Si A " + n, "si-a-" + n);
        Box b = newBox("Si B " + n, "si-b-" + n);
        coach = boxToken("sic-" + n + "@t.io", a, "COACH");
        athlete = boxToken("sia-" + n + "@t.io", a, "ATHLETE");
        otherCoach = boxToken("sio-" + n + "@t.io", b, "COACH");
        sessionId = newSession(a.getId());
        wodA = createWod("Warmup " + n, "WARMUP", "NONE");
        wodB = createWod("Metcon " + n, "FOR_TIME", "TIME");
    }

    private UUID newSession(UUID boxId) {
        actAsBox(boxId);
        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        SecurityContextHolder.clearContext();
        return s.getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
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

    private UUID createWod(String title, String type, String scoreType) throws Exception {
        String body = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"title\":\"" + title + "\",\"wodType\":\"" + type + "\",\"scoreType\":\"" + scoreType + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get("id").asText());
    }

    private String itemsJson(UUID... wodIds) {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < wodIds.length; i++) {
            if (i > 0) sb.append(',');
            boolean scoreable = i == wodIds.length - 1; // last piece scored, like a metcon finisher
            sb.append("{\"wodId\":\"").append(wodIds[i]).append("\",\"scoreable\":").append(scoreable).append('}');
        }
        return sb.append("]}").toString();
    }

    @Test
    void coachReplacesItemsAndPublishes() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].sortOrder").value(0))
                .andExpect(jsonPath("$[1].scoreable").value(true))
                .andExpect(jsonPath("$[1].scoreType").value("TIME")); // effective from FOR_TIME

        // replace with reversed order: no duplicates, new order wins
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content(itemsJson(wodB, wodA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].wodId").value(wodB.toString()));

        mvc.perform(patch("/api/box/sessions/" + sessionId + "/programming").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.programmingStatus").value("PUBLISHED"));
    }

    @Test
    void draftProgrammingInvisibleToAthletes() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content(itemsJson(wodA, wodB)));
        // athlete sees nothing while DRAFT
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        // coach preview sees drafts
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + coach))
                .andExpect(jsonPath("$.length()").value(2));
        // publish -> athlete sees items
        mvc.perform(patch("/api/box/sessions/" + sessionId + "/programming").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"));
        mvc.perform(get("/api/box/sessions/" + sessionId + "/items").header("Authorization", "Bearer " + athlete))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void athleteCannotWriteItems() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athlete).content(itemsJson(wodA)))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantSessionIs404() throws Exception {
        mvc.perform(put("/api/box/sessions/" + sessionId + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherCoach).content("{\"items\":[]}"))
                .andExpect(status().isNotFound());
    }
}
