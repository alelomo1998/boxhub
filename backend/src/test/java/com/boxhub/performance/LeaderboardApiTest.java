package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.*;
import com.boxhub.programming.SessionItem;
import com.boxhub.programming.SessionItemRepository;
import com.boxhub.programming.Wod;
import com.boxhub.programming.WodRepository;
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

class LeaderboardApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;

    String athleteA, athleteB, otherAthlete;
    UUID itemId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Lb A " + n, "lb-a-" + n);
        Box b = newBox("Lb B " + n, "lb-b-" + n);
        athleteA = boxToken("lba-" + n + "@t.io", a, "ATHLETE");
        athleteB = boxToken("lbb-" + n + "@t.io", a, "ATHLETE");
        otherAthlete = boxToken("lbo-" + n + "@t.io", b, "ATHLETE");

        actAsBox(a.getId());
        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED");
        sessions.save(s);
        Wod w = new Wod(); w.setTitle("Grace " + n); w.setMacro("WORKOUT"); w.setTimingPreset("FOR_TIME"); w.setScoreType("TIME"); wods.save(w);
        SessionItem i = new SessionItem();
        i.setSessionId(s.getId()); i.setWodId(w.getId()); i.setSortOrder(0); i.setScoreable(true);
        itemId = items.save(i).getId();
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

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private void logTime(String token, int seconds) throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + itemId + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + token)
                .content("{\"rx\":true,\"timeSeconds\":" + seconds + ",\"finished\":true,\"isPrivate\":false}"));
    }

    @Test
    void leaderboardRanksByTimeAndCarriesAvatarField() throws Exception {
        logTime(athleteA, 200);
        logTime(athleteB, 150);
        mvc.perform(get("/api/box/sessions/items/" + itemId + "/leaderboard")
                        .header("Authorization", "Bearer " + athleteA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scoreType").value("TIME"))
                .andExpect(jsonPath("$.entries[0].rank").value(1))
                .andExpect(jsonPath("$.entries[0].timeSeconds").value(150))
                .andExpect(jsonPath("$.entries[0]", org.hamcrest.Matchers.hasKey("avatarPath")))
                .andExpect(jsonPath("$.entries[1].timeSeconds").value(200));
    }

    @Test
    void crossTenantLeaderboardIs404() throws Exception {
        mvc.perform(get("/api/box/sessions/items/" + itemId + "/leaderboard")
                        .header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNotFound());
    }
}
