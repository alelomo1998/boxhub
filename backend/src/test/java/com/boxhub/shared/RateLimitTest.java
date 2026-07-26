package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = {
        "boxhub.auth-rate-limit=3",
        // LOW, on purpose — same reasoning as auth-rate-limit above. global is set high enough
        // that nothing else in this class (these tests plus the two pre-existing auth ones,
        // each on its own dedicated IP) can trip it by accident; globalCeilingTripsPerIp trips
        // it deliberately, on its own dedicated IPs.
        "boxhub.rate-limit.write=3",
        "boxhub.rate-limit.lookup=3",
        "boxhub.rate-limit.global=20"
})
class RateLimitTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void loginRateLimitedPerIp() throws Exception {
        String body = "{\"email\":\"rl@t.io\",\"password\":\"wrong-password\"}";
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                            .content(body).with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                        .content(body).with(r -> { r.setRemoteAddr("10.9.9.9"); return r; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));

        // different IP unaffected
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                        .content(body).with(r -> { r.setRemoteAddr("10.8.8.8"); return r; }))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void spoofedForwardedForDoesNotCreateFreshBucket() throws Exception {
        String body = "{\"email\":\"spoof@t.io\",\"password\":\"wrong-password\"}";
        // same real IP (remoteAddr), attacker rotates X-Forwarded-For every request
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content(body)
                            .header("X-Forwarded-For", "9.9.9." + i)
                            .with(r -> { r.setRemoteAddr("10.7.7.7"); return r; }))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content(body)
                        .header("X-Forwarded-For", "9.9.9.99")
                        .with(r -> { r.setRemoteAddr("10.7.7.7"); return r; }))
                .andExpect(status().isTooManyRequests());
    }

    // The filter runs before Spring Security (@Order(HIGHEST_PRECEDENCE)), so an unauthenticated
    // POST to any /api/box/** route reaches the limiter, gets counted, and only then 401s for
    // lack of a bearer token — no seeded box/user needed. csrf() removes CSRF as a confound so
    // the pre-limit denial is a clean, single-cause 401.
    @Test
    void writePathsRateLimitedPerIp() throws Exception {
        String[] writePaths = {
                "/api/box/invites", "/api/box/media",
                "/api/box/subscriptions/checkout", "/api/box/sessions/abc/book"
        };
        String[] ips = {"10.20.1.1", "10.20.1.2", "10.20.1.3", "10.20.1.4"};

        for (int i = 0; i < writePaths.length; i++) {
            String path = writePaths[i];
            String ip = ips[i];
            for (int n = 0; n < 3; n++) {
                mvc.perform(post(path).with(csrf())
                                .with(r -> { r.setRemoteAddr(ip); return r; }))
                        .andExpect(status().isUnauthorized());
            }
            mvc.perform(post(path).with(csrf())
                            .with(r -> { r.setRemoteAddr(ip); return r; }))
                    .andExpect(status().isTooManyRequests())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        }
    }

    @Test
    void lookupPathsRateLimitedPerIp() throws Exception {
        // GET /api/invites/{token} is permitAll; a token that hashes to nothing is an ordinary
        // 404 (NoSuchElementException), not an auth denial — still "the ordinary status", just
        // not 401/403 for this particular route.
        runToLimitThenExpect429("/api/invites/no-such-token", "10.20.2.1", status().isNotFound());
        // /api/box/receipts/** is under /api/box/** -> SCOPE_box required -> 401 unauthenticated.
        runToLimitThenExpect429("/api/box/receipts/no-such-id", "10.20.2.2", status().isUnauthorized());
    }

    private void runToLimitThenExpect429(String path, String ip,
            org.springframework.test.web.servlet.ResultMatcher preLimitStatus) throws Exception {
        for (int n = 0; n < 3; n++) {
            mvc.perform(get(path).with(r -> { r.setRemoteAddr(ip); return r; }))
                    .andExpect(preLimitStatus);
        }
        mvc.perform(get(path).with(r -> { r.setRemoteAddr(ip); return r; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void burstUnderWriteLimitPassesThrough() throws Exception {
        // writeLimit=3: two requests is a real burst under the limit, not the boundary itself.
        // Each must land as the ordinary 401, proving the request was never rate-limited —
        // a vacuous "not 429" check alone wouldn't rule out a filter that always denies.
        for (int n = 0; n < 2; n++) {
            mvc.perform(post("/api/box/invites").with(csrf())
                            .with(r -> { r.setRemoteAddr("10.20.4.1"); return r; }))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void globalCeilingTripsPerIpIndependentlyOfSpecificRules() throws Exception {
        // /api/box/my-bookings carries no write/lookup/auth rule of its own — only the global
        // counter can trip here, proving the ceiling works independently of the per-path rules.
        String path = "/api/box/my-bookings";
        for (int n = 0; n < 20; n++) {
            mvc.perform(get(path).with(r -> { r.setRemoteAddr("10.20.5.1"); return r; }))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(get(path).with(r -> { r.setRemoteAddr("10.20.5.1"); return r; }))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));

        // A second IP is unaffected: the global bucket is per-IP, not process-wide.
        mvc.perform(get(path).with(r -> { r.setRemoteAddr("10.20.5.2"); return r; }))
                .andExpect(status().isUnauthorized());
    }
}
