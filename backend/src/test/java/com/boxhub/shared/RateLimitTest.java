package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "boxhub.auth-rate-limit=3")
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
}
