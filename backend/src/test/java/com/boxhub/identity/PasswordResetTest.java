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
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PasswordResetTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    // Same T5 gotcha as VerificationTest: @MockitoBean fully mocks Mailer, so an unstubbed
    // mailer.link(...) returns null and Map.of("link", null) throws NPE before send() is reached.
    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    private User verifiedUser() {
        User u = authService.register("reset-" + System.nanoTime() + "@t.io", "old-password-here", "Reset Me");
        u.setEmailVerified(true);
        return users.save(u);
    }

    private String resetToken() {
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(any(), any(), eq("reset"), vars.capture());
        String link = (String) vars.getValue().get("link");
        assertThat(link).contains("/auth/reset?token=");
        return link.substring(link.indexOf("token=") + 6);
    }

    private void forgot(String email) throws Exception {
        mvc.perform(post("/api/auth/password/forgot").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s"}
                        """.formatted(email)))
                .andExpect(status().isAccepted());
    }

    @Test
    void forgotOnAnUnknownAddressStillReturns202AndSendsNothing() throws Exception {
        forgot("ghost-" + System.nanoTime() + "@t.io");
        verifyNoInteractions(mailer);
    }

    @Test
    void resetSetsTheNewPasswordAndKillsEverySession() throws Exception {
        User u = verifiedUser();
        refreshTokens.issue(u, "phone", "1.1.1.1");
        refreshTokens.issue(u, "laptop", "2.2.2.2");

        forgot(u.getEmail());
        String token = resetToken();

        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s","password":"brand-new-password"}
                        """.formatted(token)))
                .andExpect(status().isOk());

        // Deviation from the brief's literal test: reset revokes-all THEN mints a fresh
        // session via withSession (order matters — minting first would kill the session
        // just created), so exactly one active session survives: the new one, not zero.
        assertThat(refreshTokens.activeSessions(u.getId())).hasSize(1);

        // the new password works
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"brand-new-password"}
                        """.formatted(u.getEmail())))
                .andExpect(status().isOk());

        // the old one does not
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"old-password-here"}
                        """.formatted(u.getEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void resetAlsoVerifiesTheEmail() throws Exception {
        // Clicking a link in the inbox proves ownership of the inbox. This is also how a
        // never-verified user recovers instead of being stuck forever.
        User u = authService.register("unver-reset-" + System.nanoTime() + "@t.io", "old-password-here", "Unver");
        assertThat(u.isEmailVerified()).isFalse();

        forgot(u.getEmail());
        // register() already sent a "verify" mail; grab the reset one specifically
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(any(), any(), eq("reset"), vars.capture());
        String link = (String) vars.getValue().get("link");
        assertThat(link).contains("/auth/reset?token=");
        String token = link.substring(link.indexOf("token=") + 6);

        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s","password":"brand-new-password"}
                        """.formatted(token)))
                .andExpect(status().isOk());

        assertThat(users.findById(u.getId()).orElseThrow().isEmailVerified()).isTrue();
    }

    @Test
    void aResetTokenIsSingleUse() throws Exception {
        User u = verifiedUser();
        forgot(u.getEmail());
        String token = resetToken();
        String body = """
                {"token":"%s","password":"brand-new-password"}
                """.formatted(token);

        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isGone());
    }
}
