package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * DELETE /api/auth/sessions/{familyId} — per-session kill ("I lost my phone"), as opposed to
 * logout-all. Lives under /api/auth, not /api/me: bh_rt is Path-scoped to /api/auth (M8 gotcha
 * #8 — MockMvc does not enforce RFC 6265 cookie path matching, so a mismatch here would pass
 * every test here and still fail in a real browser).
 */
class SessionApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired RefreshTokenRepository refreshTokenRepo;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    User user;

    @BeforeEach
    void setup() {
        org.mockito.Mockito.lenient().when(mailer.link(org.mockito.ArgumentMatchers.any()))
                .thenReturn("http://localhost/x");

        user = authService.register("session-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Session");
        user.setEmailVerified(true);
        users.save(user);
    }

    private MvcResult login() throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andExpect(status().isOk())
                .andReturn();
    }

    private UUID familyOf(Cookie rt) {
        return refreshTokenRepo.findByTokenHash(RefreshTokenService.sha256(rt.getValue()))
                .orElseThrow().getFamilyId();
    }

    /**
     * The assertion that distinguishes this feature from logout-all: revoking one family leaves
     * the caller's OTHER session refreshing successfully. Against a logout-all implementation
     * (RefreshTokenService.revokeAllFor instead of revokeSession), the second refresh below would
     * 401 too, and this test would catch it.
     */
    @Test
    void deletingASessionRevokesThatFamilyOnlyTheOtherSessionStillRefreshes() throws Exception {
        MvcResult login1 = login();
        Cookie at1 = login1.getResponse().getCookie("bh_at");
        Cookie rt1 = login1.getResponse().getCookie("bh_rt");
        Cookie rt2 = login().getResponse().getCookie("bh_rt"); // a second, independent family

        mvc.perform(delete("/api/auth/sessions/{familyId}", familyOf(rt1)).with(csrf()).cookie(at1))
                .andExpect(status().isNoContent());

        // the killed family is dead
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt1))
                .andExpect(status().isUnauthorized());

        // the caller's OTHER session is untouched — this is what makes it per-session, not logout-all
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt2))
                .andExpect(status().isOk());
    }

    @Test
    void deletingAnotherUsersSessionIs404NotFoundNeverForbidden() throws Exception {
        User other = authService.register("session-other-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Other");
        other.setEmailVerified(true);
        users.save(other);
        String otherRaw = refreshTokens.issue(other, "some-ua", "1.2.3.4");
        UUID otherFamily = refreshTokenRepo.findByTokenHash(RefreshTokenService.sha256(otherRaw))
                .orElseThrow().getFamilyId();

        Cookie at = login().getResponse().getCookie("bh_at");

        // 404, never 403: a 403 would confirm the id exists, an existence oracle over another
        // user's session ids.
        mvc.perform(delete("/api/auth/sessions/{familyId}", otherFamily).with(csrf()).cookie(at))
                .andExpect(status().isNotFound());

        // and it must not actually have touched the other user's session
        assertThat(refreshTokens.activeSessions(other.getId())).hasSize(1);
    }

    @Test
    void deletingTheCurrentSessionLogsTheCallerOut() throws Exception {
        MvcResult in = login();
        Cookie at = in.getResponse().getCookie("bh_at");
        Cookie rt = in.getResponse().getCookie("bh_rt");

        mvc.perform(delete("/api/auth/sessions/{familyId}", familyOf(rt)).with(csrf()).cookie(at))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deletingASessionWithNoCredentialsIs401() throws Exception {
        // .with(csrf()): without it a credential-less write hits the CSRF filter first and 403s,
        // hiding the 401 this test is actually asserting (same reason as the conformance sweep).
        mvc.perform(delete("/api/auth/sessions/{familyId}", UUID.randomUUID()).with(csrf()))
                .andExpect(status().isUnauthorized());
    }
}
