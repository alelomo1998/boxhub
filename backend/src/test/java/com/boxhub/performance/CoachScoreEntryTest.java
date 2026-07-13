package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.programming.*;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CoachScoreEntryTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired WodScoreRepository scores;

    String coachTok, athleteTok, otherBoxCoachTok;
    UUID item, targetMembership, foreignMembership;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("cse-a-" + n); Box b = newBox("cse-b-" + n);
        coachTok = tok("csec-" + n + "@t.io", a, "COACH");
        athleteTok = tok("csea-" + n + "@t.io", a, "ATHLETE");
        otherBoxCoachTok = tok("cseo-" + n + "@t.io", b, "COACH");
        Membership target = member(a, "cset-" + n + "@t.io"); targetMembership = target.getId();
        foreignMembership = member(b, "csef-" + n + "@t.io").getId();
        actAsBox(a.getId());
        UUID session = session("PUBLISHED");
        Wod fran = wod("Fran " + n, "FOR_TIME", "TIME");
        item = item(session, fran.getId(), 0, true);
        SecurityContextHolder.clearContext();
    }

    @Test
    void coachLogsForAthleteWithLoggedBy() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + targetMembership)
                .header("Authorization", "Bearer " + coachTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(201));
        WodScore s = scores.findBySessionItemIdAndMembershipId(item, targetMembership).orElseThrow();
        assertThat(s.getLoggedBy()).isNotNull();
        assertThat(s.getTimeSeconds()).isEqualTo(201);
    }

    @Test
    void athleteCannotUseCoachEntry() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + targetMembership)
                .header("Authorization", "Bearer " + athleteTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void cannotLogForForeignBoxMembership() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + foreignMembership)
                .header("Authorization", "Bearer " + coachTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void otherBoxCoachDenied() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + targetMembership)
                .header("Authorization", "Bearer " + otherBoxCoachTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isNotFound());
    }

    // --- helpers (mirror ScoreControllerTest) ---
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256").subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }
    private Box newBox(String s) { Box x = new Box(); x.setName(s); x.setSlug(s); x.setTimezone("Europe/Rome"); return boxes.save(x); }
    private String tok(String e, Box box, String role) {
        User u = authService.register(e, "password123", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role); memberships.save(m);
        return tokenService.boxToken(u, m);
    }
    private Membership member(Box box, String e) {
        User u = authService.register(e, "password123", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole("ATHLETE"); return memberships.save(m);
    }
    private UUID session(String prog) {
        ClassSession s = new ClassSession(); s.setName("WOD Class"); s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus(prog); return sessions.save(s).getId();
    }
    private Wod wod(String t, String type, String st) { Wod w = new Wod(); w.setTitle(t); w.setWodType(type); w.setScoreType(st); return wods.save(w); }
    private UUID item(UUID sid, UUID wid, int sort, boolean sc) {
        SessionItem i = new SessionItem(); i.setSessionId(sid); i.setWodId(wid); i.setSortOrder(sort); i.setScoreable(sc); return items.save(i).getId();
    }
}
