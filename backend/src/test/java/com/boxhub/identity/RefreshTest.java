package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RefreshTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired ObjectMapper om;

    @Test
    void refreshRotatesToken() throws Exception {
        User u = authService.register("rot-" + System.nanoTime() + "@t.io", "password123", "Rot");
        // M8 T2: mechanical bridge, T3 rewrites this controller/test
        String raw = refreshTokens.issue(u, null, null);

        String body = mvc.perform(post("/api/auth/refresh").contentType(APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + raw + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        // old token is dead (rotation)
        mvc.perform(post("/api/auth/refresh").contentType(APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + raw + "\"}"))
                .andExpect(status().isUnauthorized());

        // new token works
        JsonNode json = om.readTree(body);
        mvc.perform(post("/api/auth/refresh").contentType(APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + json.get("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk());
    }
}
