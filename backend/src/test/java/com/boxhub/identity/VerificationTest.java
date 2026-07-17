package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
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
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class VerificationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    // Deviation from the brief's literal test (same issue as MailerTest, task-4-report.md):
    // @MockitoBean fully mocks Mailer, so an unstubbed mailer.link(...) returns null and
    // Map.of("link", null) throws NPE before send() is even reached. Stub link() to behave
    // like the real Mailer.link so AuthService's Map.of(...) construction succeeds.
    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    private String register(String email) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery","name":"New Athlete"}
                        """.formatted(email)))
                .andExpect(status().isCreated());
        return email;
    }

    /** Pulls the raw token out of the link the Mailer was asked to send, asserting the link
     *  points at the real /auth/verify route (not a bare, dead path). */
    private String tokenFromMail(String template) {
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(any(), any(), eq(template), vars.capture());
        String link = (String) vars.getValue().get("link");
        assertThat(link).contains("/auth/verify?token=");
        return link.substring(link.indexOf("token=") + 6);
    }

    @Test
    void registrationCreatesAnUnverifiedUserAndMailsAVerifyLink() throws Exception {
        String email = register("verify-" + System.nanoTime() + "@t.io");

        User u = users.findByEmail(email).orElseThrow();
        assertThat(u.isEmailVerified()).isFalse();
        assertThat(tokenFromMail("verify")).isNotBlank();
    }

    @Test
    void anUnverifiedUserWithTheRightPasswordIsToldToVerify() throws Exception {
        String email = register("unverified-" + System.nanoTime() + "@t.io");

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(email)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void anUnverifiedUserWithTheWRONGPasswordGetsAGeneric401() throws Exception {
        // Login must never become an enumeration oracle: only a correct password earns
        // the verified-or-not answer.
        String email = register("oracle-" + System.nanoTime() + "@t.io");

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"not-the-password"}
                        """.formatted(email)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void verifyingTheTokenLogsTheUserIn() throws Exception {
        String email = register("ok-" + System.nanoTime() + "@t.io");
        String token = tokenFromMail("verify");

        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s"}
                        """.formatted(token)))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("bh_at"));

        assertThat(users.findByEmail(email).orElseThrow().isEmailVerified()).isTrue();
    }

    @Test
    void aVerifyTokenIsSingleUse() throws Exception {
        register("single-" + System.nanoTime() + "@t.io");
        String token = tokenFromMail("verify");
        String body = """
                {"token":"%s"}
                """.formatted(token);

        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isGone());
    }

    @Test
    void registeringAnExistingEmailReturns201AndWarnsTheRealOwner() throws Exception {
        User existing = authService.register("taken-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Owner");

        // No 409 — a 409 would tell an attacker the address is registered.
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"another-password-xx","name":"Impostor"}
                        """.formatted(existing.getEmail())))
                .andExpect(status().isCreated());

        verify(mailer).send(eq(existing.getEmail()), any(), eq("register-attempt"), any());
        // and the real account is untouched
        assertThat(users.findByEmail(existing.getEmail()).orElseThrow().getName()).isEqualTo("Owner");
    }

    @Test
    void registerEchoesOnlyWhatWasSubmitted() throws Exception {
        User existing = authService.register("taken2-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Owner");

        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"another-password-xx","name":"Sentinel Name"}
                        """.formatted(existing.getEmail())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Sentinel Name"))
                .andExpect(jsonPath("$.email").value(existing.getEmail()))
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.not(existing.getId().toString())));
    }

    @Test
    void freshAndCollisionRegistrationResponsesHaveTheSameShape() throws Exception {
        User existing = authService.register("taken3-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Owner");
        String freshEmail = "fresh-" + System.nanoTime() + "@t.io";

        var freshBody = mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"another-password-xx","name":"Fresh Athlete"}
                        """.formatted(freshEmail)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Fresh Athlete"))
                .andExpect(jsonPath("$.email").value(freshEmail))
                .andReturn().getResponse().getContentAsString();

        var takenBody = mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"another-password-xx","name":"Impostor"}
                        """.formatted(existing.getEmail())))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        assertThat(fieldNames(freshBody)).isEqualTo(fieldNames(takenBody));
    }

    /** Field-name set of a JSON object body, for shape comparisons that ignore values. */
    private static java.util.Set<String> fieldNames(String json) throws Exception {
        var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
        java.util.Set<String> names = new java.util.TreeSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    @Test
    void resendAlwaysReturns202EvenForAnUnknownAddress() throws Exception {
        mvc.perform(post("/api/auth/verify/resend").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"nobody-%d@t.io"}
                        """.formatted(System.nanoTime())))
                .andExpect(status().isAccepted());
    }
}
