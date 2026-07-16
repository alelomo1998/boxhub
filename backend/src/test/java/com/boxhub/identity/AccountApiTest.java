package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    User user;
    Cookie at;

    @BeforeEach
    void setup() throws Exception {
        org.mockito.Mockito.when(mailer.link(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(inv -> "https://app.test" + inv.getArgument(0));

        user = authService.register("acct-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Account");
        user.setEmailVerified(true);
        user = users.save(user);
        at = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andReturn().getResponse().getCookie("bh_at");
    }

    @Test
    void changingThePasswordRevokesEveryOtherSession() throws Exception {
        refreshTokens.issue(user, "other-device", "9.9.9.9");
        assertThat(refreshTokens.activeSessions(user.getId())).hasSize(2); // login + the other device

        mvc.perform(patch("/api/me/password").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"correct-horse-battery","newPassword":"a-brand-new-secret"}
                        """))
                .andExpect(status().isNoContent());

        // Every session is gone and the caller gets a fresh one — a password change is how
        // you evict someone who is already inside.
        assertThat(refreshTokens.activeSessions(user.getId())).hasSize(1);
    }

    @Test
    void changingThePasswordRequiresTheCurrentOne() throws Exception {
        mvc.perform(patch("/api/me/password").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"not-the-password","newPassword":"a-brand-new-secret"}
                        """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aWeakNewPasswordIsRejected() throws Exception {
        mvc.perform(patch("/api/me/password").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"correct-horse-battery","newPassword":"password123"}
                        """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anEmailChangeTakesEffectOnlyAfterTheNEWAddressConfirms() throws Exception {
        String oldEmail = user.getEmail();
        String newEmail = "moved-" + System.nanoTime() + "@t.io";

        mvc.perform(post("/api/me/email").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"password":"correct-horse-battery","newEmail":"%s"}
                        """.formatted(newEmail)))
                .andExpect(status().isAccepted());

        // Not yet — anyone could type an address they do not own.
        assertThat(users.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(oldEmail);

        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(eq(newEmail), any(), eq("email-change"), vars.capture());
        String link = (String) vars.getValue().get("link");
        String token = link.substring(link.indexOf("token=") + 6);

        mvc.perform(post("/api/me/email/confirm").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s"}
                        """.formatted(token)))
                .andExpect(status().isNoContent());

        assertThat(users.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(newEmail);
    }

    @Test
    void sessionsListTheDevicesAndLogOutEverywhereKillsThem() throws Exception {
        refreshTokens.issue(user, "Chrome on Android", "5.5.5.5");

        mvc.perform(get("/api/me/sessions").cookie(at))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(post("/api/auth/logout-all").with(csrf()).cookie(at))
                .andExpect(status().isNoContent());

        assertThat(refreshTokens.activeSessions(user.getId())).isEmpty();
    }
}
