package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LoginThrottleTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired LoginThrottleService throttle;

    private User verifiedUser() {
        User u = authService.register("throttle-" + System.nanoTime() + "@t.io", "right-password-xx", "Throttle");
        u.setEmailVerified(true);
        return users.save(u);
    }

    private void badLogin(User u, int status) throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"wrong-password-xx"}
                        """.formatted(u.getEmail())))
                .andExpect(status().is(status));
    }

    @Test
    void fiveFailuresThrottleTheAccountRegardlessOfIp() throws Exception {
        User u = verifiedUser();
        for (int i = 0; i < 5; i++) badLogin(u, 401);

        // The 6th is refused before the password is even checked — a rotating IP pool
        // does not help the attacker, because the counter is on the account.
        badLogin(u, 429);
        assertThat(users.findById(u.getId()).orElseThrow().getThrottledUntil()).isAfter(Instant.now());
    }

    @Test
    void theThrottleNeverBecomesAPermanentLock() {
        User u = verifiedUser();
        for (int i = 0; i < 50; i++) throttle.recordFailure(users.findById(u.getId()).orElseThrow());

        // A hard lock would hand an attacker a free DoS against a box owner: type bad
        // passwords, and they cannot get into their own gym before class. So it caps.
        Instant until = users.findById(u.getId()).orElseThrow().getThrottledUntil();
        assertThat(until).isBefore(Instant.now().plusSeconds(15 * 60 + 5));
    }

    @Test
    void aSuccessfulLoginClearsTheCounter() throws Exception {
        User u = verifiedUser();
        badLogin(u, 401);
        badLogin(u, 401);

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"right-password-xx"}
                        """.formatted(u.getEmail())))
                .andExpect(status().isOk());

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getFailedAttempts()).isZero();
        assertThat(after.getThrottledUntil()).isNull();
    }
}
