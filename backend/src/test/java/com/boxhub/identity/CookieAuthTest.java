package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

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

    User user;

    @BeforeEach
    void setup() {
        user = authService.register("cookie-" + System.nanoTime() + "@t.io", "password1234", "Cookie");
        user.setEmailVerified(true);
        users.save(user);
    }

    private MvcResult login() throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"password1234"}
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
}
