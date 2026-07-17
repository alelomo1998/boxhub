package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RefreshTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;

    @Test
    void refreshRotatesToken() throws Exception {
        User u = authService.register("rot-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Rot");
        u.setEmailVerified(true);
        users.save(u);

        MvcResult loginResult = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                        .content("{\"email\":\"" + u.getEmail() + "\",\"password\":\"correct-horse-battery\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie rt = loginResult.getResponse().getCookie("bh_rt");

        MvcResult res = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("bh_at"))
                .andExpect(cookie().exists("bh_rt"))
                .andReturn();

        // new token works (checked BEFORE the replay below, which revokes the whole family)
        Cookie newRt = res.getResponse().getCookie("bh_rt");
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(newRt))
                .andExpect(status().isOk());

        // old token is dead (rotation): replaying it is reuse detection -> 401
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isUnauthorized());
    }
}
