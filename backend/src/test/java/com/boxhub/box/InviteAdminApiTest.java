package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InviteAdminApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired InviteRepository invites;

    String adminToken, athleteToken, otherBoxAdminToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Inv Box A " + n, "inv-a-" + n);
        Box boxB = newBox("Inv Box B " + n, "inv-b-" + n);
        adminToken = boxToken("iadm-" + n + "@t.io", boxA, "BOX_ADMIN");
        athleteToken = boxToken("iath-" + n + "@t.io", boxA, "ATHLETE");
        otherBoxAdminToken = boxToken("iadm2-" + n + "@t.io", boxB, "BOX_ADMIN");
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void adminCreatesInviteWithLinkAndListsIt() throws Exception {
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"new@member.io\",\"role\":\"ATHLETE\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.link").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        String link = om.readTree(body).get("link").asText();
        assertThat(link).startsWith("/join/");
        // raw token not persisted: only its hash exists in DB
        String raw = link.substring("/join/".length());
        assertThat(invites.findAll()).noneMatch(i -> raw.equals(i.getTokenHash()));

        mvc.perform(get("/api/box/invites").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].email").value("new@member.io"))
                .andExpect(jsonPath("$[0].link").doesNotExist())
                .andExpect(jsonPath("$[0].tokenHash").doesNotExist());
    }

    @Test
    void athleteCannotInvite() throws Exception {
        mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"email\":\"x@y.io\",\"role\":\"ATHLETE\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidRoleIs400() throws Exception {
        mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"x@y.io\",\"role\":\"OWNER\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void revokeRemovesInvite_crossTenantRevokeIs404() throws Exception {
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"rev@member.io\",\"role\":\"COACH\"}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(delete("/api/box/invites/" + id)
                        .header("Authorization", "Bearer " + otherBoxAdminToken))
                .andExpect(status().isNotFound());

        mvc.perform(delete("/api/box/invites/" + id)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/box/invites").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$[?(@.email=='rev@member.io')]").isEmpty());
    }
}
