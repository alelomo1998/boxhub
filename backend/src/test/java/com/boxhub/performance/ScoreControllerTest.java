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

class ScoreControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;

    String athleteA, athleteB, otherAthlete;
    UUID publishedItem, draftItem, unscoreableItem;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Sc A " + n, "sc-a-" + n);
        Box b = newBox("Sc B " + n, "sc-b-" + n);
        athleteA = boxToken("sca-" + n + "@t.io", a, "ATHLETE");
        athleteB = boxToken("scb-" + n + "@t.io", a, "ATHLETE");
        otherAthlete = boxToken("sco-" + n + "@t.io", b, "ATHLETE");

        actAsBox(a.getId());
        UUID published = session("PUBLISHED");
        UUID draft = session("DRAFT");
        Wod fran = wod("Fran " + n, "FOR_TIME", "TIME");
        Wod warm = wod("Warmup " + n, "WARMUP", "NONE");
        publishedItem = item(published, fran, 0, true);
        unscoreableItem = item(published, warm, 1, false);
        draftItem = item(draft, fran, 0, true);
        SecurityContextHolder.clearContext();
    }

    private UUID session(String programmingStatus) {
        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        s.setProgrammingStatus(programmingStatus);
        return sessions.save(s).getId();
    }

    private Wod wod(String title, String type, String scoreType) {
        Wod w = new Wod(); w.setTitle(title);
        if ("WARMUP".equals(type)) w.setMacro("WARMUP");
        else { w.setMacro("WORKOUT"); w.setTimingPreset(type); }
        w.setScoreType(scoreType);
        return wods.save(w);
    }

    private UUID item(UUID sessionId, Wod wod, int sort, boolean scoreable) {
        SessionItem i = new SessionItem();
        i.setSessionId(sessionId); i.setWodId(wod.getId()); i.setSortOrder(sort); i.setScoreable(scoreable);
        return items.save(i).getId();
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

    @Test
    void athleteLogsAndEditsOwnScore() throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + publishedItem + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"rx\":true,\"timeSeconds\":183,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(183))
                .andExpect(jsonPath("$.scoreType").value("TIME"));
        mvc.perform(put("/api/box/sessions/items/" + publishedItem + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA)
                        .content("{\"rx\":true,\"timeSeconds\":170,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(170));
        mvc.perform(get("/api/box/sessions/items/" + publishedItem + "/score")
                        .header("Authorization", "Bearer " + athleteA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(170));
    }

    @Test
    void scoresArePerAthlete() throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + publishedItem + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteA).content("{\"rx\":true,\"timeSeconds\":183,\"isPrivate\":false}"));
        mvc.perform(put("/api/box/sessions/items/" + publishedItem + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteB).content("{\"rx\":false,\"timeSeconds\":240,\"isPrivate\":false}"));
        mvc.perform(get("/api/box/sessions/items/" + publishedItem + "/score").header("Authorization", "Bearer " + athleteA))
                .andExpect(jsonPath("$.timeSeconds").value(183));
        mvc.perform(get("/api/box/sessions/items/" + publishedItem + "/score").header("Authorization", "Bearer " + athleteB))
                .andExpect(jsonPath("$.timeSeconds").value(240));
    }

    @Test
    void cannotScoreDraftInstance() throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + draftItem + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA).content("{\"rx\":true,\"timeSeconds\":183}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void cannotScoreUnscoreablePiece() throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + unscoreableItem + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteA).content("{\"rx\":true,\"timeSeconds\":183}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void cannotScoreForeignItem() throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + publishedItem + "/score").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherAthlete).content("{\"rx\":true,\"timeSeconds\":183}"))
                .andExpect(status().isNotFound());
    }
}
