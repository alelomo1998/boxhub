package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "boxhub.superadmin-emails=root@boxhub.io")
class BoxCreationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;

    @Test
    void superadminCreatesBox_normalUserDenied() throws Exception {
        long n = System.nanoTime();
        User root = authService.register("root@boxhub.io", "password123", "Root");
        User pleb = authService.register("pleb-" + n + "@t.io", "password123", "Pleb");

        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(pleb))
                        .content("{\"name\":\"Nope Box\",\"slug\":\"nope-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(root))
                        .content("{\"name\":\"Root Box\",\"slug\":\"root-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value("root-" + n));

        // duplicate slug
        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(root))
                        .content("{\"name\":\"Root Box 2\",\"slug\":\"root-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isConflict());
    }
}
