package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

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
    @Autowired TokenService tokenService;
    @Autowired AccountService accountService;
    @Autowired EmailTokenService emailTokens;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    User user;
    Cookie at;
    Cookie rt;

    @BeforeEach
    void setup() throws Exception {
        org.mockito.Mockito.when(mailer.link(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(inv -> "https://app.test" + inv.getArgument(0));

        user = authService.register("acct-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Account");
        user.setEmailVerified(true);
        user = users.save(user);
        var loginResponse = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andReturn().getResponse();
        at = loginResponse.getCookie("bh_at");
        rt = loginResponse.getCookie("bh_rt");
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

        mvc.perform(get("/api/auth/sessions").cookie(at))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(post("/api/auth/logout-all").with(csrf()).cookie(at))
                .andExpect(status().isNoContent());

        assertThat(refreshTokens.activeSessions(user.getId())).isEmpty();
    }

    @Test
    void sessionsMarkExactlyTheCallersDeviceAsCurrent() throws Exception {
        refreshTokens.issue(user, "Chrome on Android", "5.5.5.5");

        String body = mvc.perform(get("/api/auth/sessions").cookie(at, rt))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<Map<String, Object>> sessions = new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(body, new com.fasterxml.jackson.core.type.TypeReference<>() {});
        assertThat(sessions).hasSize(2);
        assertThat(sessions.stream().filter(s -> (boolean) s.get("current")).count()).isEqualTo(1);
        assertThat(sessions.stream().filter(s -> !(boolean) s.get("current")).count()).isEqualTo(1);
    }

    @Test
    void sessionsWithoutARefreshCookieMarkNoRowAsCurrent() throws Exception {
        // bearer-header caller: no bh_rt cookie to hash, so nothing can be "this device"
        String bearer = tokenService.userToken(user);

        mvc.perform(get("/api/auth/sessions").header("Authorization", "Bearer " + bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].current").value(false));
    }

    /**
     * MockMvc's .cookie(...) attaches cookies to the mock request unconditionally — it does not
     * enforce RFC 6265 Path matching the way a real browser does. That blind spot is exactly how
     * the original bug (sessions endpoint under /api/me, bh_rt scoped to /api/auth — a real
     * browser never sends bh_rt there, so "current" was false on every row, forever) sailed
     * through every MockMvc-based assertion above. This test pins the actual contract: it reads
     * the real Set-Cookie header for bh_rt from a login response, parses its Path attribute, and
     * asserts the sessions endpoint URI is actually reachable under that path per RFC 6265
     * path-matching rules (equal, or a `/`-bounded prefix) — not just "the test happened to pass".
     */
    @Test
    void theRefreshCookiePathActuallyReachesTheSessionsEndpoint() throws Exception {
        String setCookie = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andReturn().getResponse().getHeaders(org.springframework.http.HttpHeaders.SET_COOKIE)
                .stream().filter(h -> h.startsWith("bh_rt=")).findFirst()
                .orElseThrow(() -> new AssertionError("no bh_rt Set-Cookie header on login response"));

        String cookiePath = java.util.Arrays.stream(setCookie.split(";"))
                .map(String::trim)
                .filter(attr -> attr.regionMatches(true, 0, "Path=", 0, 5))
                .map(attr -> attr.substring(5))
                .findFirst()
                .orElseThrow(() -> new AssertionError("bh_rt cookie has no Path attribute: " + setCookie));

        String sessionsPath = "/api/auth/sessions";
        boolean pathMatches = sessionsPath.equals(cookiePath)
                || (sessionsPath.startsWith(cookiePath)
                    && (cookiePath.endsWith("/") || sessionsPath.charAt(cookiePath.length()) == '/'));

        assertThat(pathMatches)
                .withFailMessage("bh_rt cookie Path=%s does not reach %s per RFC 6265 path matching — " +
                        "a real browser would never send it there", cookiePath, sessionsPath)
                .isTrue();
    }

    @Test
    void changePasswordIsDeniedWithoutAuth() throws Exception {
        mvc.perform(patch("/api/me/password").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"correct-horse-battery","newPassword":"a-brand-new-secret"}
                        """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void startEmailChangeIsDeniedWithoutAuth() throws Exception {
        mvc.perform(post("/api/me/email").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"password":"correct-horse-battery","newEmail":"someone-else@t.io"}
                        """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sessionsIsDeniedWithoutAuth() throws Exception {
        mvc.perform(get("/api/auth/sessions"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void confirmEmailChangeIsReachableWithoutAuth() throws Exception {
        // permitAll by design — clicked from an inbox, possibly with no session on that device.
        // A bogus token must fail on its own terms (400/410), never with 401.
        mvc.perform(post("/api/me/email/confirm").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"not-a-real-token"}
                        """))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isNotEqualTo(401));
    }

    @Test
    void concurrentEmailChangeToTheSameAddressOneWinsTheOtherGetsConflictNever500() throws Exception {
        // Two different users both confirm an email change to the SAME new address at the
        // same instant against real Postgres. Both pass the pre-check (the address belongs
        // to no one yet), then race the unique constraint on users.email. The loser must
        // land on 409 EMAIL_TAKEN, never an unhandled DataIntegrityViolationException (500).
        // Looped with fresh users/address each iteration — timing-dependent, a single shot
        // can miss the interleaving (same rationale as GoogleLinkTest's equivalent race test).
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 5; i++) {
                User a = authService.register("race-a-" + System.nanoTime() + "@t.io", "correct-horse-battery", "A");
                a.setEmailVerified(true);
                a = users.save(a);
                User b = authService.register("race-b-" + System.nanoTime() + "@t.io", "correct-horse-battery", "B");
                b.setEmailVerified(true);
                b = users.save(b);

                String target = "race-target-" + System.nanoTime() + "@t.io";
                String tokenA = emailTokens.issue(a, EmailTokenService.EMAIL_CHANGE, target, EmailTokenService.CHANGE_TTL);
                String tokenB = emailTokens.issue(b, EmailTokenService.EMAIL_CHANGE, target, EmailTokenService.CHANGE_TTL);

                CyclicBarrier barrier = new CyclicBarrier(2);
                Callable<Object> attemptA = () -> {
                    barrier.await();
                    try { return accountService.completeEmailChange(tokenA); }
                    catch (Exception e) { return e; }
                };
                Callable<Object> attemptB = () -> {
                    barrier.await();
                    try { return accountService.completeEmailChange(tokenB); }
                    catch (Exception e) { return e; }
                };

                List<Future<Object>> futures = List.of(pool.submit(attemptA), pool.submit(attemptB));
                List<Object> results = futures.stream().map(f -> {
                    try { return f.get(); } catch (Exception e) { throw new RuntimeException(e); }
                }).toList();

                long successes = results.stream().filter(r -> r instanceof User).count();
                long conflicts = results.stream()
                        .filter(r -> r instanceof org.springframework.web.server.ResponseStatusException rse
                                && rse.getStatusCode().value() == 409)
                        .count();
                long unexpected = results.size() - successes - conflicts;

                assertThat(unexpected)
                        .withFailMessage("expected only a User (winner) or 409 CONFLICT (loser), got: %s", results)
                        .isZero();
                assertThat(successes).isEqualTo(1);
                assertThat(conflicts).isEqualTo(1);
                assertThat(users.findByEmail(target)).isPresent();
            }
        } finally {
            pool.shutdown();
        }
    }

    @Test
    void passwordlessUserCannotChangePasswordOrEmail() throws Exception {
        User googleOnly = new User();
        googleOnly.setEmail("google-only-" + System.nanoTime() + "@t.io");
        googleOnly.setPasswordHash(null);
        googleOnly.setName("Google Only");
        googleOnly.setEmailVerified(true);
        googleOnly = users.save(googleOnly);
        String bearer = tokenService.userToken(googleOnly);

        mvc.perform(patch("/api/me/password").with(csrf()).header("Authorization", "Bearer " + bearer)
                        .contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"anything","newPassword":"a-brand-new-secret"}
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("NO_PASSWORD_SET"));

        mvc.perform(post("/api/me/email").with(csrf()).header("Authorization", "Bearer " + bearer)
                        .contentType(APPLICATION_JSON).content("""
                        {"password":"anything","newEmail":"new-address@t.io"}
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("NO_PASSWORD_SET"));
    }

    /**
     * The riskiest binding detail in AccountController#delete: a truly bodyless DELETE (no
     * JSON, no content-type) must bind @RequestBody(required = false) DeleteRequest to null and
     * reach the 401 "bad credentials" path — not blow up in Spring's message conversion with a
     * 400 HttpMessageNotReadableException first. Proven at the HTTP layer, not by direct method
     * call.
     */
    @Test
    void deletingWithoutABodyIs401ForAPasswordUser() throws Exception {
        mvc.perform(delete("/api/me").with(csrf()).cookie(at))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deletingWithTheWrongPasswordIs401() throws Exception {
        mvc.perform(delete("/api/me").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"password":"not-the-password"}
                        """))
                .andExpect(status().isUnauthorized());

        User stillHere = users.findById(user.getId()).orElseThrow();
        assertThat(stillHere.getName()).isEqualTo("Account");
        assertThat(stillHere.getAnonymizedAt()).isNull();
    }

    @Test
    void deletingWithTheCorrectPasswordSucceedsAndClearsCookies() throws Exception {
        var response = mvc.perform(delete("/api/me").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"password":"correct-horse-battery"}
                        """))
                .andExpect(status().isNoContent())
                .andReturn().getResponse();

        // The endpoint clears the cookies — they now point at a person who no longer exists.
        for (String name : List.of("bh_at", "bh_rt", "bh_bt")) {
            String setCookie = response.getHeaders(org.springframework.http.HttpHeaders.SET_COOKIE).stream()
                    .filter(h -> h.startsWith(name + "="))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("no " + name + " Set-Cookie header on delete response"));
            assertThat(setCookie).containsIgnoringCase("Max-Age=0");
        }

        User gone = users.findById(user.getId()).orElseThrow();
        assertThat(gone.getName()).isEqualTo("Deleted athlete");
        assertThat(gone.getAnonymizedAt()).isNotNull();
    }

    @Test
    void aGoogleOnlyUserCanDeleteWithoutAPassword() throws Exception {
        User googleOnly = new User();
        googleOnly.setEmail("google-only-" + System.nanoTime() + "@t.io");
        googleOnly.setPasswordHash(null);
        googleOnly.setName("Google Only");
        googleOnly.setEmailVerified(true);
        googleOnly = users.save(googleOnly);
        String bearer = tokenService.userToken(googleOnly);

        // bearer-header requests skip CSRF by design — no .with(csrf()) needed here.
        mvc.perform(delete("/api/me").header("Authorization", "Bearer " + bearer))
                .andExpect(status().isNoContent());

        User gone = users.findById(googleOnly.getId()).orElseThrow();
        assertThat(gone.getName()).isEqualTo("Deleted athlete");
        assertThat(gone.getAnonymizedAt()).isNotNull();
    }
}
