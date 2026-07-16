package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxSettingsTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String adminToken, athleteToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Settings Box " + n);
        b.setSlug("set-" + n);
        b.setTimezone("Europe/Rome");
        boxes.save(b);
        User admin = authService.register("sadm-" + n + "@t.io", "correct-horse-battery", "SAdm");
        Membership ma = new Membership();
        ma.setUser(admin); ma.setBox(b); ma.setRole("BOX_ADMIN");
        memberships.save(ma);
        adminToken = tokenService.boxToken(admin, ma);
        User ath = authService.register("sath-" + n + "@t.io", "correct-horse-battery", "SAth");
        Membership mt = new Membership();
        mt.setUser(ath); mt.setBox(b); mt.setRole("ATHLETE");
        memberships.save(mt);
        athleteToken = tokenService.boxToken(ath, mt);
    }

    @Test
    void adminUpdatesSettings() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Renamed Box\",\"logoUrl\":\"https://cdn.example.com/logo.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed Box"))
                .andExpect(jsonPath("$.logoUrl").value("https://cdn.example.com/logo.png"));

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.name").value("Renamed Box"))
                .andExpect(jsonPath("$.logoUrl").value("https://cdn.example.com/logo.png"));
    }

    @Test
    void athleteCannotUpdateSettings() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"Hax\"}"))
                .andExpect(status().isForbidden());
    }
}
