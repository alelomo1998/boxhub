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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InviteAcceptApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired InviteRepository invites;
    @Autowired org.springframework.transaction.PlatformTransactionManager txManager;

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
        User admin = authService.register("aadm-" + n + "@t.io", "correct-horse-battery", "Adm");
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
        User joiner = authService.register("joiner-" + n + "@t.io", "correct-horse-battery", "Joiner");
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
        mvc.perform(post("/api/invites/" + token + "/accept").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void existingMemberAcceptIs409() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("dupm-" + n + "@t.io", "ATHLETE");
        User joiner = authService.register("dupm-" + n + "@t.io", "correct-horse-battery", "Dup");
        Membership existing = new Membership();
        existing.setUser(joiner);
        existing.setBox(box);
        existing.setRole("ATHLETE");
        memberships.save(existing);

        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + tokenService.userToken(joiner)))
                .andExpect(status().isConflict());
    }

    @Test
    void userWithActiveBoxTokenCanPreviewAndAcceptForeignBoxInvite() throws Exception {
        long n = System.nanoTime();
        // invite into the test's `box` (created in setup, admin-scoped)
        String token = createInviteLink("cross-" + n + "@t.io", "ATHLETE");

        // a user who is ALREADY an admin of a DIFFERENT box, holding that box's token
        Box otherBox = new Box();
        otherBox.setName("Other Box " + n);
        otherBox.setSlug("other-" + n);
        otherBox.setTimezone("Europe/Rome");
        boxes.save(otherBox);
        User joiner = authService.register("cross-" + n + "@t.io", "correct-horse-battery", "Cross Joiner");
        Membership om = new Membership();
        om.setUser(joiner);
        om.setBox(otherBox);
        om.setRole("BOX_ADMIN");
        memberships.save(om);
        String boxToken = tokenService.boxToken(joiner, om); // tenant = otherBox

        // preview must resolve the invite even though the token's tenant is otherBox
        mvc.perform(get("/api/invites/" + token).header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boxName").value(box.getName()));

        // accept must create membership in the INVITE's box (box), not otherBox
        mvc.perform(post("/api/invites/" + token + "/accept").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boxId").value(box.getId().toString()));
    }

    @Test
    void previewResolvesPlanNameEvenUnderAForeignBoxAmbientTenant() throws Exception {
        // Reproduces the @TenantId trap for reads: Plan is @TenantId, and preview() is permitAll,
        // so it can be hit with SOME other box's JWT already in the SecurityContext (e.g. a cookie
        // from a box-admin's own dashboard tab). A plans.findById() not wrapped in runAsBox would
        // silently filter to that WRONG box and return empty -> planName always null. Two boxes,
        // seeded independently, so this fails against the un-wrapped derived-query version.
        long n = System.nanoTime();
        String planBody = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Unlimited " + n + "\",\"durationDays\":30}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String planName = om.readTree(planBody).get("name").asText();
        String planId = om.readTree(planBody).get("id").asText();

        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"planprev-" + n + "@t.io\",\"role\":\"ATHLETE\",\"planId\":\"" + planId + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String token = om.readTree(body).get("link").asText().substring("/join/".length());

        // a user who is ALREADY an admin of a DIFFERENT box, holding that box's token
        Box otherBox = new Box();
        otherBox.setName("Plan Preview Other Box " + n);
        otherBox.setSlug("plan-prev-other-" + n);
        otherBox.setTimezone("Europe/Rome");
        boxes.save(otherBox);
        User otherAdmin = authService.register("planprevadm-" + n + "@t.io", "correct-horse-battery", "Other Adm");
        Membership om2 = new Membership();
        om2.setUser(otherAdmin);
        om2.setBox(otherBox);
        om2.setRole("BOX_ADMIN");
        memberships.save(om2);
        String otherBoxToken = tokenService.boxToken(otherAdmin, om2); // ambient tenant = otherBox, not `box`

        mvc.perform(get("/api/invites/" + token).header("Authorization", "Bearer " + otherBoxToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boxName").value(box.getName()))
                .andExpect(jsonPath("$.planName").value(planName));
    }

    @Test
    void burnIsAtomicSingleUse() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("race-" + n + "@t.io", "ATHLETE");
        var inv = invites.findByTokenHash(
                com.boxhub.identity.RefreshTokenService.sha256(token)).orElseThrow();
        // @Modifying burn needs a tx; wrap only the burns (prod accept() is @Transactional).
        // Second call must see 0 rows: the conditional UPDATE ... WHERE accepted_at IS NULL
        // is what makes concurrent accepts single-use.
        var tx = new org.springframework.transaction.support.TransactionTemplate(txManager);
        tx.executeWithoutResult(s -> {
            assertThat(invites.burnIfUnaccepted(inv.getId(), java.time.Instant.now())).isEqualTo(1);
            assertThat(invites.burnIfUnaccepted(inv.getId(), java.time.Instant.now())).isEqualTo(0);
        });
    }
}
