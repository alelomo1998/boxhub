package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
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

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class HistoryControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired BenchmarkTemplateRepository benchmarks;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    String athlete;
    UUID benchItem1, benchItem2, plainItem;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Hist A " + n, "hist-a-" + n);
        athlete = boxToken("ha-" + n + "@t.io", a, "ATHLETE");

        actAsBox(a.getId());
        // a benchmark-linked wod (provenance) + a plain one
        UUID bmId = UUID.randomUUID();
        jdbc.update("insert into benchmark_template (id, name, kind, score_type, body_text, blocks_json) "
                        + "values (?, ?, 'GIRL', 'TIME', 'x', '{\"blocks\":[]}'::jsonb)",
                bmId, "Fran " + n);
        Wod bench = new Wod();
        bench.setTitle("Fran " + n); bench.setWodType("FOR_TIME"); bench.setScoreType("TIME");
        bench.setBenchmarkTemplateId(bmId);
        wods.save(bench);
        Wod plain = new Wod();
        plain.setTitle("Random " + n); plain.setWodType("FOR_TIME"); plain.setScoreType("TIME");
        wods.save(plain);

        benchItem1 = item(session(Instant.now().minusSeconds(86400)), bench.getId());
        benchItem2 = item(session(Instant.now()), bench.getId());
        plainItem = item(session(Instant.now().plusSeconds(3600)), plain.getId());
        SecurityContextHolder.clearContext();
    }

    private UUID session(Instant startAt) {
        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(startAt); s.setDurationMin(60); s.setCapacity(12);
        s.setProgrammingStatus("PUBLISHED");
        return sessions.save(s).getId();
    }

    private UUID item(UUID sessionId, UUID wodId) {
        SessionItem i = new SessionItem();
        i.setSessionId(sessionId); i.setWodId(wodId); i.setSortOrder(0); i.setScoreable(true);
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
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private void score(UUID itemId, int seconds) throws Exception {
        mvc.perform(put("/api/box/sessions/items/" + itemId + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athlete)
                .content("{\"rx\":true,\"timeSeconds\":" + seconds + ",\"finished\":true,\"isPrivate\":false}"));
    }

    @Test
    void benchmarkHistoryPicksBestAndExcludesNonBenchmark() throws Exception {
        score(benchItem1, 200);
        score(benchItem2, 150); // better
        score(plainItem, 90);   // non-benchmark, excluded

        mvc.perform(get("/api/box/benchmark-history").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].timeSeconds").value(150));

        mvc.perform(get("/api/box/my-scores").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].className").value("WOD Class"));
    }
}
