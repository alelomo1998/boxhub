package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.CookieService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TvStreamApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired TvDeviceRepository devices;
    @Autowired TokenService tokenService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private TvDevice activeDevice(Box box) {
        TvDevice d = new TvDevice();
        d.setBoxId(box.getId()); d.setName("TV"); d.setStatus("ACTIVE"); d.setSecretHash("h");
        return devices.save(d);
    }

    @Test
    void streamOpensAndSendsInitialState() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvst-" + n);
        TvDevice d = activeDevice(a);
        String token = tokenService.tvToken(d.getId(), a.getId());

        // ONLY the bh_tv cookie — no ?token= — is how the credential must ride now (M11 T5).
        MvcResult r = mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, token)))
                .andExpect(request().asyncStarted()).andReturn();
        // initial snapshot is written synchronously on connect
        String body = r.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).contains("event:state").contains("IDLE");
    }

    @Test
    void noCookieRejected() throws Exception {
        mvc.perform(get("/api/tv/stream"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void queryParamAloneNoLongerWorks() throws Exception {
        // regression guard: the old ?token= path must be gone — a request carrying the token only
        // as a query param (no cookie) must be rejected, or the credential would still leak into logs.
        long n = System.nanoTime();
        Box a = newBox("tvqp-" + n);
        TvDevice d = activeDevice(a);
        String token = tokenService.tvToken(d.getId(), a.getId());
        mvc.perform(get("/api/tv/stream").param("token", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void badCookieRejected() throws Exception {
        mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, "garbage")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void revokedDeviceRejected() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvrv-" + n);
        TvDevice d = activeDevice(a);
        String token = tokenService.tvToken(d.getId(), a.getId());
        d.setStatus("REVOKED");
        devices.save(d);
        mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, token)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void boxScopedTokenCannotOpenATvStream() throws Exception {
        // The real assertion the old test's name promised. A box token is a VALID, correctly
        // signed JWT — only its scope claim differs — so this exercises the scope check itself
        // rather than the device lookup. It discriminates: a box token has no device_id claim,
        // so removing the scope check yields a 500 (UUID.fromString(null)), not a 401.
        long n = System.nanoTime();
        Box a = newBox("tvscope-" + n);
        User u = authService.register("tvscope-" + n + "@t.io", "correct-horse-battery", "TV Scope");
        Membership m = new Membership();
        m.setUser(u); m.setBox(a); m.setRole("BOX_ADMIN");
        m = memberships.save(m);
        String boxToken = tokenService.boxToken(u, m);

        mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, boxToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownDeviceIdIsRejectedEvenWithAValidTvToken() throws Exception {
        // What the old boxTokenIsNotATvToken actually asserted — kept, under an honest name.
        long n = System.nanoTime();
        Box a = newBox("tvwr-" + n);
        activeDevice(a);
        String token = tokenService.tvToken(UUID.randomUUID(), a.getId());
        mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, token)))
                .andExpect(status().isUnauthorized());
    }
}
