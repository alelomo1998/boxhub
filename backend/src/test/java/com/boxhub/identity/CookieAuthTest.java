package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CookieAuthTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;
    @Autowired TokenService tokenService;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired SecurityFilterChain securityFilterChain;

    User user;

    @BeforeEach
    void setup() {
        user = authService.register("cookie-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Cookie");
        user.setEmailVerified(true);
        users.save(user);

        // .with(csrf()) (used elsewhere in this class and other test classes sharing the
        // cached Spring context) reflectively swaps the singleton CsrfFilter's
        // tokenRepository field for a session-based test double and never restores it —
        // silently poisoning every later test that needs the REAL CookieCsrfTokenRepository
        // behavior (e.g. csrfEndpointIssuesTheXsrfCookie). Reset it before every test so
        // these tests don't depend on JUnit's undefined method execution order.
        for (jakarta.servlet.Filter f : securityFilterChain.getFilters()) {
            if (f instanceof CsrfFilter) {
                ReflectionTestUtils.setField(f, "tokenRepository", CookieCsrfTokenRepository.withHttpOnlyFalse());
            }
        }
    }

    /** Mints an already-expired bh_at-shaped JWT, the same claim shape TokenService.userToken produces. */
    private Cookie expiredAccessCookie() {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("boxhub")
                .subject(user.getId().toString())
                .claim("name", user.getName())
                .claim("scope", "user")
                .issuedAt(now.minus(Duration.ofHours(2)))
                .expiresAt(now.minus(Duration.ofHours(1)))
                .build();
        String jwt = jwtEncoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
        return new Cookie(CookieService.AT, jwt);
    }

    private MvcResult login() throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andExpect(status().isOk())
                .andReturn();
    }

    @Test
    void loginSetsHttpOnlyCookiesAndNoTokensInTheBody() throws Exception {
        MvcResult res = login();

        Cookie at = res.getResponse().getCookie("bh_at");
        Cookie rt = res.getResponse().getCookie("bh_rt");
        assertThat(at).isNotNull();
        assertThat(at.isHttpOnly()).isTrue();
        assertThat(rt).isNotNull();
        assertThat(rt.isHttpOnly()).isTrue();
        assertThat(rt.getPath()).isEqualTo("/api/auth");

        assertThat(res.getResponse().getContentAsString()).doesNotContain("accessToken");
        assertThat(res.getResponse().getContentAsString()).doesNotContain("refreshToken");
    }

    @Test
    void theAccessCookieAuthenticatesARequest() throws Exception {
        Cookie at = login().getResponse().getCookie("bh_at");

        mvc.perform(get("/api/me").cookie(at))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(user.getEmail()));
    }

    @Test
    void aCookieRequestWithoutCsrfIsRejected() throws Exception {
        Cookie at = login().getResponse().getCookie("bh_at");

        mvc.perform(post("/api/auth/logout").cookie(at))
                .andExpect(status().isForbidden());
    }

    @Test
    void logoutClearsTheCookiesAndKillsTheRefreshToken() throws Exception {
        MvcResult in = login();
        Cookie at = in.getResponse().getCookie("bh_at");
        Cookie rt = in.getResponse().getCookie("bh_rt");

        MvcResult out = mvc.perform(post("/api/auth/logout").with(csrf()).cookie(at, rt))
                .andExpect(status().isNoContent())
                .andReturn();

        assertThat(out.getResponse().getCookie("bh_at").getMaxAge()).isZero();
        assertThat(out.getResponse().getCookie("bh_rt").getMaxAge()).isZero();

        // the refresh token is dead server-side, not merely dropped by the client
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshRotatesTheCookie() throws Exception {
        Cookie rt = login().getResponse().getCookie("bh_rt");

        MvcResult res = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(res.getResponse().getCookie("bh_rt").getValue()).isNotEqualTo(rt.getValue());
        assertThat(res.getResponse().getCookie("bh_at")).isNotNull();
    }

    @Test
    void bearerHeaderStillWorksAndNeedsNoCsrf() throws Exception {
        // The 159 pre-M8 tests authenticate this way. It must keep working.
        String jwt = tokenService.userToken(user);
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk());
    }

    @Test
    void bearerHeaderPostWithNoCsrfTokenSucceeds() throws Exception {
        // Same rule from the write side: a bearer-authenticated POST needs no csrf() at all.
        String jwt = tokenService.userToken(user);
        mvc.perform(post("/api/auth/logout-all").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isNoContent());
    }

    @Test
    void logoutWithAnExpiredAccessCookieStillSucceeds() throws Exception {
        // CRITICAL: BearerTokenAuthenticationFilter authenticates whatever the resolver
        // returns BEFORE authorization runs. An expired bh_at cookie must not 401 a
        // permitAll endpoint like logout — the browser needs to be able to clear its
        // session even when the access cookie has gone stale.
        Cookie rt = login().getResponse().getCookie("bh_rt");
        Cookie expiredAt = expiredAccessCookie();

        MvcResult out = mvc.perform(post("/api/auth/logout").with(csrf()).cookie(expiredAt, rt))
                .andExpect(status().isNoContent())
                .andReturn();

        assertThat(out.getResponse().getCookie("bh_at").getMaxAge()).isZero();
        assertThat(out.getResponse().getCookie("bh_rt").getMaxAge()).isZero();

        // refresh token really dead server-side, not merely dropped by the client
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginSucceedsWithAnExpiredAccessCookiePresent() throws Exception {
        // CRITICAL: a browser holding an expired bh_at cookie must still be able to log in —
        // the stale cookie must not shadow the anonymous /login endpoint.
        mvc.perform(post("/api/auth/login").with(csrf()).cookie(expiredAccessCookie())
                        .contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andExpect(status().isOk());
    }

    @Test
    void csrfEndpointIssuesTheXsrfCookie() throws Exception {
        // CRITICAL: deferred CSRF tokens only get written when CsrfToken.getToken() is called.
        MvcResult res = mvc.perform(get("/api/auth/csrf")).andReturn();

        Cookie xsrf = res.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();
        assertThat(xsrf.getValue()).isNotBlank();
    }

    @Test
    void theRealCsrfRoundTripWorksWithoutTestBypass() throws Exception {
        // No .with(csrf()) anywhere in this test — this is the real browser flow end to end.
        MvcResult csrfRes = mvc.perform(get("/api/auth/csrf")).andReturn();
        Cookie xsrf = csrfRes.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();

        mvc.perform(post("/api/auth/login").cookie(xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
                        .contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("bh_at"));
    }
}
