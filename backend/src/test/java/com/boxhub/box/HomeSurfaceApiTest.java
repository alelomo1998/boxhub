package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
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

/** Home aggregate + announcement + session detail + admin KPIs. */
class HomeSurfaceApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired ObjectMapper om;

    String admin, coach, athlete, otherAthlete;
    UUID sessionId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Hm A " + n, "hm-a-" + n);
        Box b = newBox("Hm B " + n, "hm-b-" + n);
        admin = member("hma-" + n + "@t.io", a, "BOX_ADMIN");
        coach = member("hmc-" + n + "@t.io", a, "COACH");
        athlete = member("hmx-" + n + "@t.io", a, "ATHLETE");
        otherAthlete = member("hmo-" + n + "@t.io", b, "ATHLETE");

        actAsBox(a.getId());
        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(7200));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        sessionId = s.getId();
        SecurityContextHolder.clearContext();
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

    private String member(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void announcementLifecycle() throws Exception {
        mvc.perform(get("/api/box/announcement").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isNoContent());
        mvc.perform(put("/api/box/announcement").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"body\":\"Box closes early Friday\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/box/announcement").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("Box closes early Friday"));
        // athletes cannot write
        mvc.perform(put("/api/box/announcement").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athlete).content("{\"body\":\"hack\"}"))
                .andExpect(status().isForbidden());
        // other box sees nothing (tenant isolation)
        mvc.perform(get("/api/box/announcement").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNoContent());
    }

    @Test
    void homeAggregateShowsNextBookingAfterBooking() throws Exception {
        // empty home first
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextBooking").doesNotExist())
                .andExpect(jsonPath("$.stats.checkinsThisWeek").isNumber());
        // book the session
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(jsonPath("$.nextBooking.className").value("WOD Class"))
                .andExpect(jsonPath("$.nextBooking.bookedCount").value(1));
    }

    @Test
    void sessionDetailShowsGridAndIsMemberVisible() throws Exception {
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book").header("Authorization", "Bearer " + athlete));
        mvc.perform(get("/api/box/sessions/" + sessionId + "/detail").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("WOD Class"))
                .andExpect(jsonPath("$.active.length()").value(1))
                .andExpect(jsonPath("$.active[0].name").isNotEmpty())
                .andExpect(jsonPath("$.queue.length()").value(0));
        // cross-tenant
        mvc.perform(get("/api/box/sessions/" + sessionId + "/detail").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminStatsForAdminOnly() throws Exception {
        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeMembers").isNumber())
                .andExpect(jsonPath("$.weekAttendance.fillPct").isNumber());
        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }
}
