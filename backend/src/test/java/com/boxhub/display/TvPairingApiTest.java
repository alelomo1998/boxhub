package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TvPairingApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TvDeviceRepository devices;
    @Autowired JwtDecoder jwtDecoder;

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    record Pair(String code, String secret) {}

    private Pair pair() throws Exception {
        MvcResult r = mvc.perform(post("/api/tv/pair").with(csrf())).andExpect(status().isOk()).andReturn();
        var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.getResponse().getContentAsString());
        return new Pair(json.get("code").asText(), json.get("secret").asText());
    }

    @Test
    void fullPairingLifecycle() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tv-a-" + n);
        String coach = boxToken("tvc-" + n + "@t.io", a, "COACH");
        Pair p = pair();
        assertThat(p.code()).hasSize(6);

        // pending: 202, no token yet
        mvc.perform(post("/api/tv/pair/poll").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isAccepted());

        // coach claims
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"Rig wall left\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rig wall left"));

        // poll now returns a tv-scoped token bound to box A
        MvcResult r = mvc.perform(post("/api/tv/pair/poll").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty()).andReturn();
        String token = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(r.getResponse().getContentAsString()).get("token").asText();
        var jwt = jwtDecoder.decode(token);
        assertThat(jwt.getClaimAsString("scope")).isEqualTo("tv");
        assertThat(jwt.getClaimAsString("box_id")).isEqualTo(a.getId().toString());
        assertThat(jwt.getClaimAsString("device_id")).isNotEmpty();
    }

    @Test
    void wrongSecretRejected() throws Exception {
        Pair p = pair();
        mvc.perform(post("/api/tv/pair/poll").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"nope\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void expiredCodeGone() throws Exception {
        Pair p = pair();
        TvDevice d = devices.findByPairingCode(p.code()).orElseThrow();
        // back-date past the 10-minute TTL via native update (createdAt has no setter)
        devices.findAll(); // no-op keep repo warm
        org.springframework.test.util.ReflectionTestUtils.setField(d, "createdAt",
                java.time.Instant.now().minus(java.time.Duration.ofMinutes(11)));
        devices.save(d);
        mvc.perform(post("/api/tv/pair/poll").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isGone());
    }

    @Test
    void athleteCannotClaim() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tv-ath-" + n);
        String athlete = boxToken("tva-" + n + "@t.io", a, "ATHLETE");
        Pair p = pair();
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + athlete)
                .contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"x\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void claimedCodeCannotBeReclaimedByAnotherBox() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvh-a-" + n);
        Box b = newBox("tvh-b-" + n);
        String coachA = boxToken("tvha-" + n + "@t.io", a, "COACH");
        String coachB = boxToken("tvhb-" + n + "@t.io", b, "COACH");
        Pair p = pair();

        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + coachA)
                .contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"Box A TV\"}"))
                .andExpect(status().isOk());

        // Box B tries to hijack the same code: the device is no longer PENDING -> 404
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + coachB)
                .contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"steal\"}"))
                .andExpect(status().isNotFound());

        assertThat(devices.findByPairingCode(p.code()).orElseThrow().getBoxId()).isEqualTo(a.getId());
    }

    @Test
    void claimWithoutAuthDenied() throws Exception {
        Pair p = pair();
        mvc.perform(post("/api/box/tv/claim").with(csrf()).contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"x\"}"))
                .andExpect(status().isUnauthorized());
    }
}
