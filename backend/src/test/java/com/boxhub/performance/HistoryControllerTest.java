package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.boxhub.programming.TrackService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
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
    @Autowired TrackService trackService;
    @Autowired ObjectMapper om;

    String coach, athlete;
    UUID rxTrack;
    LocalDate today = LocalDate.now();
    LocalDate tomorrow = LocalDate.now().plusDays(1);

    @BeforeEach
    void setup() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("Hist A " + n, "hist-a-" + n);
        trackService.seedDefaults(a.getId());
        coach = boxToken("hc-" + n + "@t.io", a, "COACH");
        athlete = boxToken("ha-" + n + "@t.io", a, "ATHLETE");
        String tracks = mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        rxTrack = UUID.fromString(om.readTree(tracks).get(0).get("id").asText());
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

    private UUID cloneFirstBenchmark() throws Exception {
        String bms = mvc.perform(get("/api/box/benchmarks").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        UUID bmId = UUID.fromString(om.readTree(bms).get(0).get("id").asText());
        String wod = mvc.perform(post("/api/box/benchmarks/" + bmId + "/clone").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(wod).get("id").asText());
    }

    private UUID createPlainWod() throws Exception {
        String wod = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"title\":\"Random\",\"wodType\":\"FOR_TIME\",\"scoreType\":\"TIME\"}"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(wod).get("id").asText());
    }

    private String publishSlot(LocalDate date, UUID track, UUID wod) throws Exception {
        String body = mvc.perform(put("/api/box/program").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"slotDate\":\"" + date + "\",\"trackId\":\"" + track + "\",\"wodId\":\"" + wod + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();
        mvc.perform(patch("/api/box/program/" + id).contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + coach).content("{\"status\":\"PUBLISHED\"}"));
        return id;
    }

    private void score(String slot, int seconds) throws Exception {
        mvc.perform(put("/api/box/program/" + slot + "/score").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athlete)
                .content("{\"rx\":true,\"timeSeconds\":" + seconds + ",\"finished\":true,\"isPrivate\":false}"));
    }

    @Test
    void benchmarkHistoryPicksBestAndExcludesNonBenchmark() throws Exception {
        UUID benchWod = cloneFirstBenchmark();
        String s1 = publishSlot(today, rxTrack, benchWod);
        UUID fitTrack;
        String tracks = mvc.perform(get("/api/box/tracks").header("Authorization", "Bearer " + coach))
                .andReturn().getResponse().getContentAsString();
        fitTrack = UUID.fromString(om.readTree(tracks).get(1).get("id").asText());
        String s2 = publishSlot(today, fitTrack, benchWod); // same benchmark, different slot
        score(s1, 200);
        score(s2, 150); // better

        UUID plain = createPlainWod();
        String s3 = publishSlot(tomorrow, rxTrack, plain);
        score(s3, 90); // non-benchmark, must be excluded from benchmark-history

        mvc.perform(get("/api/box/benchmark-history").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].timeSeconds").value(150));

        mvc.perform(get("/api/box/my-scores").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }
}
