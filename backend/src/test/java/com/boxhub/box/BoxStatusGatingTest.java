package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.display.TvDevice;
import com.boxhub.display.TvDeviceRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxStatusGatingTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TvDeviceRepository devices;
    @Autowired ObjectMapper om;

    private Box newBox(String slug, String status) {
        Box b = new Box();
        b.setName(slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setStatus(status);
        return boxes.save(b);
    }

    /** Registers the owner and mints a user-scoped bearer token (for hitting /api/auth/box-token). */
    private String userToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.userToken(u);
    }

    /** Mints a box-scoped bearer token directly (bypasses the mint gate — for fixture setup only). */
    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    record Pair(String code, String secret) {}

    private Pair pair() throws Exception {
        MvcResult r = mvc.perform(post("/api/tv/pair")).andExpect(status().isOk()).andReturn();
        var json = om.readTree(r.getResponse().getContentAsString());
        return new Pair(json.get("code").asText(), json.get("secret").asText());
    }

    @Test
    void suspendedBoxCannotMintABoxToken() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-susp-" + n, "SUSPENDED");
        String user = userToken("bsg-susp-" + n + "@t.io", box, "BOX_ADMIN");
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + user)
                        .content("{\"boxId\":\"" + box.getId() + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("BOX_SUSPENDED"));
    }

    @Test
    void rejectedBoxCannotMintABoxToken() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-rej-" + n, "REJECTED");
        String user = userToken("bsg-rej-" + n + "@t.io", box, "BOX_ADMIN");
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + user)
                        .content("{\"boxId\":\"" + box.getId() + "\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("BOX_SUSPENDED"));
    }

    @Test
    void pendingBoxMintsNormally() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-pend-mint-" + n, "PENDING");
        String user = userToken("bsg-pend-mint-" + n + "@t.io", box, "BOX_ADMIN");
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + user)
                        .content("{\"boxId\":\"" + box.getId() + "\"}"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().exists("bh_bt"));
    }

    @Test
    void pendingBoxCannotCreateInvites() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-pend-inv-" + n, "PENDING");
        String admin = boxToken("bsg-pend-inv-" + n + "@t.io", box, "BOX_ADMIN");
        mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + admin)
                        .content("{\"email\":\"invitee-" + n + "@t.io\",\"role\":\"ATHLETE\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("BOX_PENDING"));
    }

    @Test
    void pendingBoxCannotClaimATv() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-pend-tv-" + n, "PENDING");
        String coach = boxToken("bsg-pend-tv-" + n + "@t.io", box, "COACH");
        Pair p = pair();
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + coach)
                        .contentType(APPLICATION_JSON)
                        .content("{\"code\":\"" + p.code() + "\",\"name\":\"x\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("BOX_PENDING"));
    }

    @Test
    void pendingBoxCanStillPrepare() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-pend-prep-" + n, "PENDING");
        String admin = boxToken("bsg-pend-prep-" + n + "@t.io", box, "BOX_ADMIN");
        mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + admin)
                        .content("{\"name\":\"WOD\",\"weekday\":1,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isCreated());
    }

    @Test
    void suspendedBoxTvStreamIsRefused() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("bsg-susp-stream-" + n, "ACTIVE");
        String coach = boxToken("bsg-susp-stream-" + n + "@t.io", box, "COACH");
        Pair p = pair();
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + coach)
                        .contentType(APPLICATION_JSON)
                        .content("{\"code\":\"" + p.code() + "\",\"name\":\"Rig wall\"}"))
                .andExpect(status().isOk());

        MvcResult pollResult = mvc.perform(post("/api/tv/pair/poll").contentType(APPLICATION_JSON)
                        .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isOk()).andReturn();
        // token rides home as the bh_tv cookie (M11 T5), not the response body — pull it from Set-Cookie
        String setCookie = pollResult.getResponse().getHeaders(org.springframework.http.HttpHeaders.SET_COOKIE)
                .stream().filter(h -> h.startsWith("bh_tv=")).findFirst()
                .orElseThrow(() -> new AssertionError("no bh_tv Set-Cookie header on poll success"));
        String tvToken = setCookie.substring("bh_tv=".length(), setCookie.indexOf(';'));

        box.setStatus("SUSPENDED");
        boxes.save(box);

        mvc.perform(get("/api/tv/stream").cookie(new jakarta.servlet.http.Cookie("bh_tv", tvToken)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("BOX_SUSPENDED"));
    }
}
