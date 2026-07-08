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

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InviteAcceptApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    Box box;
    String adminToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        box = new Box();
        box.setName("Accept Box " + n);
        box.setSlug("acc-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);
        User admin = authService.register("aadm-" + n + "@t.io", "password123", "Adm");
        Membership m = new Membership();
        m.setUser(admin);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);
        adminToken = tokenService.boxToken(admin, m);
    }

    private String createInviteLink(String email, String role) throws Exception {
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
                .andReturn().getResponse().getContentAsString();
        return om.readTree(body).get("link").asText().substring("/join/".length());
    }

    @Test
    void previewShowsBoxAndRole() throws Exception {
        String token = createInviteLink("prev@t.io", "ATHLETE");
        mvc.perform(get("/api/invites/" + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boxName").value(box.getName()))
                .andExpect(jsonPath("$.role").value("ATHLETE"));
    }

    @Test
    void unknownTokenIs404() throws Exception {
        mvc.perform(get("/api/invites/definitely-not-a-token"))
                .andExpect(status().isNotFound());
    }

    @Test
    void acceptCreatesMembershipAndBurnsInvite() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("joiner-" + n + "@t.io", "ATHLETE");
        User joiner = authService.register("joiner-" + n + "@t.io", "password123", "Joiner");
        String userToken = tokenService.userToken(joiner);

        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ATHLETE"))
                .andExpect(jsonPath("$.boxId").value(box.getId().toString()));

        // second accept: invite burned -> 410
        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isGone());
    }

    @Test
    void acceptWithoutAuthIs401() throws Exception {
        String token = createInviteLink("anon@t.io", "ATHLETE");
        mvc.perform(post("/api/invites/" + token + "/accept"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void existingMemberAcceptIs409() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("dupm-" + n + "@t.io", "ATHLETE");
        User joiner = authService.register("dupm-" + n + "@t.io", "password123", "Dup");
        Membership existing = new Membership();
        existing.setUser(joiner);
        existing.setBox(box);
        existing.setRole("ATHLETE");
        memberships.save(existing);

        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + tokenService.userToken(joiner)))
                .andExpect(status().isConflict());
    }
}
