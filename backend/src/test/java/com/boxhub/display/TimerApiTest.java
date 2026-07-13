package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TimerApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private Box newBox(String s) { Box x = new Box(); x.setName(s); x.setSlug(s); x.setTimezone("Europe/Rome"); return boxes.save(x); }
    private String tok(String e, Box box, String role) {
        User u = authService.register(e, "password123", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role); memberships.save(m);
        return tokenService.boxToken(u, m);
    }
    private UUID session(Box box) {
        // system-scoped save via a coach token round-trip is overkill; save under a box tenant in the test helper
        org.springframework.security.oauth2.jwt.Jwt jwt = org.springframework.security.oauth2.jwt.Jwt
                .withTokenValue("t").header("alg","HS256").subject(UUID.randomUUID().toString())
                .claim("scope","box").claim("box_id", box.getId().toString()).claim("role","BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.TestingAuthenticationToken(jwt, null, "SCOPE_box"));
        ClassSession s = new ClassSession(); s.setName("WOD Class"); s.setStartAt(Instant.now());
        s.setDurationMin(60); s.setCapacity(12);
        UUID id = sessions.save(s).getId();
        SecurityContextHolder.clearContext();
        return id;
    }

    @Test
    void armStartPauseResumeLifecycle() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tmr-" + n);
        String coach = tok("tmrc-" + n + "@t.io", a, "COACH");
        UUID sid = session(a);
        String spec = "{\"type\":\"AMRAP\",\"totalSeconds\":600}";

        // no timer yet -> 204
        mvc.perform(get("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach))
                .andExpect(status().isNoContent());

        // arm
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"ARM\",\"spec\":" + spec + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));

        // start
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"START\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.startedAtEpoch").isNumber());

        // pause -> accrues elapsed, clears startedAtEpoch
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"PAUSE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAUSED"))
                .andExpect(jsonPath("$.startedAtEpoch").doesNotExist());

        // resume
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"RESUME\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RUNNING"));

        // reset -> PENDING, elapsed 0
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"RESET\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.pausedElapsedMs").value(0));
    }

    @Test
    void athleteCannotControlTimer() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tmra-" + n);
        String athlete = tok("tmraa-" + n + "@t.io", a, "ATHLETE");
        UUID sid = session(a);
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + athlete)
                .contentType(APPLICATION_JSON).content("{\"action\":\"ARM\",\"spec\":{\"type\":\"AMRAP\",\"totalSeconds\":600}}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantSessionDenied() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tmrx-a-" + n); Box b = newBox("tmrx-b-" + n);
        String coachB = tok("tmrxb-" + n + "@t.io", b, "COACH");
        UUID sidA = session(a);
        mvc.perform(get("/api/box/sessions/" + sidA + "/timer").header("Authorization", "Bearer " + coachB))
                .andExpect(status().isNotFound());
    }
}
