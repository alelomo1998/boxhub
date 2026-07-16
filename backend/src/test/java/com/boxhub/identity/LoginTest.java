package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LoginTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired UserRepository users;

    User user;

    @BeforeEach
    void setup() {
        user = authService.register("login-" + System.nanoTime() + "@t.io", "password123", "Log In");
        user.setEmailVerified(true);
        users.save(user);
        Box b = new Box();
        b.setName("Login Box");
        b.setSlug("login-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        boxes.save(b);
        Membership m = new Membership();
        m.setUser(user);
        m.setBox(b);
        m.setRole("ATHLETE");
        memberships.save(m);
    }

    @Test
    void loginReturnsTokensAndMemberships() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"%s","password":"password123"}
                """.formatted(user.getEmail())))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("bh_at"))
                .andExpect(cookie().httpOnly("bh_at", true))
                .andExpect(jsonPath("$.memberships[0].boxName").value("Login Box"))
                .andExpect(jsonPath("$.memberships[0].role").value("ATHLETE"));
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"%s","password":"wrong-password"}
                """.formatted(user.getEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownEmailIs401() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"nobody-here@t.io","password":"password123"}
                """))
                .andExpect(status().isUnauthorized());
    }
}
