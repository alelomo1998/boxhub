package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.Mailer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
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
    @MockitoBean Mailer mailer;

    String adminToken, athleteToken, otherBoxAdminToken;

    // Same T5/T6/T9 gotcha: @MockitoBean fully mocks Mailer, so an unstubbed
    // mailer.link(...) returns null and Map.of("link", null) NPEs before send() is reached.
    // Must run before authService.register() (called from boxToken() below), and JUnit 5
    // doesn't order multiple @BeforeEach methods by declaration — so it's one method.
    @BeforeEach
    void setup() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));

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
        User u = authService.register(email, "correct-horse-battery", email);
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
    void creatingAnInviteEmailsTheLinkToTheInvitee() throws Exception {
        String invitee = "invitee-" + System.nanoTime() + "@t.io";

        mvc.perform(post("/api/box/invites").header("Authorization", "Bearer " + adminToken)
                        .contentType(APPLICATION_JSON).content("""
                        {"email":"%s","role":"ATHLETE"}
                        """.formatted(invitee)))
                .andExpect(status().isCreated());

        org.mockito.ArgumentCaptor<java.util.Map<String, Object>> vars =
                org.mockito.ArgumentCaptor.forClass(java.util.Map.class);
        verify(mailer).send(org.mockito.ArgumentMatchers.eq(invitee), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.eq("invite"), vars.capture());

        assertThat((String) vars.getValue().get("link")).contains("/join?token=");
        assertThat((String) vars.getValue().get("boxName")).isNotBlank();
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
    void unknownPlanIdIs400() throws Exception {
        mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"x@y.io\",\"role\":\"ATHLETE\",\"planId\":\"" +
                                java.util.UUID.randomUUID() + "\"}"))
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
