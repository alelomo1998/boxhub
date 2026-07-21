package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MemberApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired ObjectMapper om;

    Box boxA;
    String adminToken;
    Membership adminMembership;
    Membership athleteMembership;
    User athleteUser;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxA = new Box();
        boxA.setName("Mem Box " + n);
        boxA.setSlug("mem-" + n);
        boxA.setTimezone("Europe/Rome");
        boxes.save(boxA);

        User admin = authService.register("madm-" + n + "@t.io", "correct-horse-battery", "Mem Admin");
        adminMembership = member(admin, "BOX_ADMIN");
        adminToken = tokenService.boxToken(admin, adminMembership);

        athleteUser = authService.register("math-" + n + "@t.io", "correct-horse-battery", "Searchable Athlete");
        athleteMembership = member(athleteUser, "ATHLETE");

        // M10: expiringSoon/planName now come off the active Subscription's currentPeriodEnd, not
        // the dead Membership.expiresAt column — a 5-day plan gives this athlete an "expiring soon"
        // subscription end.
        actAsBox(boxA.getId());
        Plan p = new Plan();
        p.setName("Expiring soon plan " + n);
        p.setDurationDays(5);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(athleteMembership.getId(), planId, 0, "test");
        SecurityContextHolder.clearContext();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Membership member(User u, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxA);
        m.setRole(role);
        return memberships.save(m);
    }

    @Test
    void listsAndSearchesMembersWithExpiryFlag() throws Exception {
        mvc.perform(get("/api/box/members").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mvc.perform(get("/api/box/members").param("search", "searchable")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].name").value("Searchable Athlete"))
                .andExpect(jsonPath("$.content[0].expiringSoon").value(true))
                .andExpect(jsonPath("$.content[0].subscriptionId").exists());
    }

    @Test
    void patchChangesRoleStatusExpiry() throws Exception {
        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"role\":\"COACH\",\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("COACH"))
                .andExpect(jsonPath("$.status").value("SUSPENDED"));
    }

    @Test
    void cannotDemoteLastActiveAdmin() throws Exception {
        mvc.perform(patch("/api/box/members/" + adminMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"role\":\"ATHLETE\"}"))
                .andExpect(status().isConflict());

        mvc.perform(patch("/api/box/members/" + adminMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void invalidRoleValueIs400() throws Exception {
        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"role\":\"KING\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void athleteCannotListOrPatch() throws Exception {
        String athleteToken = tokenService.boxToken(athleteUser, athleteMembership);
        mvc.perform(get("/api/box/members").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"role\":\"COACH\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        long n = System.nanoTime();
        Box boxB = new Box();
        boxB.setName("Mem Box B " + n);
        boxB.setSlug("mem-b-" + n);
        boxB.setTimezone("Europe/Rome");
        boxes.save(boxB);
        User otherAdmin = authService.register("madm2-" + n + "@t.io", "correct-horse-battery", "Other Adm");
        Membership om2 = new Membership();
        om2.setUser(otherAdmin);
        om2.setBox(boxB);
        om2.setRole("BOX_ADMIN");
        memberships.save(om2);
        String otherToken = tokenService.boxToken(otherAdmin, om2);

        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherToken)
                        .content("{\"role\":\"COACH\"}"))
                .andExpect(status().isNotFound());
    }
}
