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

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BenchmarkControllerTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired BenchmarkTemplateRepository benchmarks;
    @Autowired ObjectMapper om;

    String aCoach, aAthlete, bCoach;
    UUID franId;
    String franName;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Bm Box A " + n, "bm-a-" + n);
        Box boxB = newBox("Bm Box B " + n, "bm-b-" + n);
        aCoach = boxToken("bmc-" + n + "@t.io", boxA, "COACH");
        aAthlete = boxToken("bma-" + n + "@t.io", boxA, "ATHLETE");
        bCoach = boxToken("bmc2-" + n + "@t.io", boxB, "COACH");
        franName = "Fran " + n;
        franId = seedBenchmark(franName, "GIRL");
        seedBenchmark("Murph " + n, "HERO");
    }

    // BenchmarkTemplate is intentionally read-only (no setters); seed via native SQL in the test DB.
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    private UUID seedBenchmark(String name, String kind) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into benchmark_template (id, name, kind, score_type, time_cap_seconds, body_text, blocks_json) "
                        + "values (?, ?, ?, 'TIME', 600, ?, '{\"blocks\":[]}'::jsonb)",
                id, name, kind, "21-15-9 thrusters/pullups");
        return id;
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void benchmarksAreGlobalVisibleToEveryBox() throws Exception {
        mvc.perform(get("/api/box/benchmarks").header("Authorization", "Bearer " + aCoach))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", hasItem(franName)));
        mvc.perform(get("/api/box/benchmarks").header("Authorization", "Bearer " + bCoach))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", hasItem(franName)));
    }

    @Test
    void cloneWritesBoxWodWithProvenanceAndIsBoxScoped() throws Exception {
        String body = mvc.perform(post("/api/box/benchmarks/" + franId + "/clone")
                        .header("Authorization", "Bearer " + aCoach))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value(franName))
                .andExpect(jsonPath("$.benchmarkTemplateId").value(franId.toString()))
                .andReturn().getResponse().getContentAsString();
        String wodId = om.readTree(body).get("id").asText();

        // clone is box A's WOD; box B cannot see it
        mvc.perform(get("/api/box/wods/" + wodId).header("Authorization", "Bearer " + bCoach))
                .andExpect(status().isNotFound());
    }

    @Test
    void athleteCannotClone() throws Exception {
        mvc.perform(post("/api/box/benchmarks/" + franId + "/clone")
                        .header("Authorization", "Bearer " + aAthlete))
                .andExpect(status().isForbidden());
    }
}
