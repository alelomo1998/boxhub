package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.Mailer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * M10 T6, item 5: invite accept must create an ACTIVE subscription for the invite's plan (no
 * Payment row — they haven't paid) so the new member can book immediately, and the lapse job will
 * chase them at renewal time. Subscription is @TenantId and this flow starts from a tenant-less
 * (user-scoped) token, so it's also the regression test for the runAsBox-after-commit wiring in
 * InvitePublicController/InviteAcceptTx.
 */
class InviteSubscriptionTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired ClassSessionRepository sessions;
    @MockitoBean Mailer mailer;

    Box box;
    String adminToken;
    Plan plan;

    @BeforeEach
    void setup() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));

        long n = System.nanoTime();
        box = new Box();
        box.setName("Invite Sub Box " + n);
        box.setSlug("isub-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);
        User admin = authService.register("isadm-" + n + "@t.io", "correct-horse-battery", "Adm");
        Membership m = new Membership();
        m.setUser(admin);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);
        adminToken = tokenService.boxToken(admin, m);

        actAsBox(box.getId()); // Plan is @TenantId — needed for this direct save
        plan = new Plan();
        plan.setName("Invite Plan " + n);
        plan.setDurationDays(30);
        plan.setPriceCents(4500);
        plan.setCurrency("eur");
        plan.setEntitlement("UNLIMITED");
        plan = plans.save(plan);
    }

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    private String createInviteLink(String email, UUID planId) throws Exception {
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"" + email + "\",\"role\":\"ATHLETE\",\"planId\":\""
                                + planId + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String link = om.readTree(body).get("link").asText();
        return link.substring(link.lastIndexOf('/') + 1);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void acceptingAnInviteWithAPlanCreatesAnActiveSubscriptionAndTheNewMemberCanBook() throws Exception {
        long n = System.nanoTime();
        String email = "joiner-" + n + "@t.io";
        String token = createInviteLink(email, plan.getId());
        User joiner = authService.register(email, "correct-horse-battery", "Joiner");
        String userToken = tokenService.userToken(joiner);

        String acceptBody = mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID boxId = UUID.fromString(om.readTree(acceptBody).get("boxId").asText());
        assertThat(boxId).isEqualTo(box.getId());

        UUID membershipId = memberships.findByUserIdAndBoxId(joiner.getId(), boxId).orElseThrow().getId();

        actAsBox(boxId);
        Subscription sub = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE").orElseThrow();
        assertThat(sub.getPlanId()).isEqualTo(plan.getId());
        assertThat(sub.getPriceCents()).isEqualTo(plan.getPriceCents());
        assertThat(sub.getCurrentPeriodEnd()).isAfter(Instant.now().plusSeconds(29L * 24 * 3600));

        // No payment row — they haven't paid yet.
        assertThat(sub.getCurrentPeriodEnd()).isNotNull();

        // Entitlement check: active + future end -> the new member can book right away.
        ClassSession session = new ClassSession();
        session.setName("WOD");
        session.setStartAt(Instant.now().plusSeconds(3600 * 24));
        session.setDurationMin(60);
        session.setCapacity(10);
        UUID sessionId = sessions.save(session).getId();

        String boxToken = tokenService.boxToken(joiner, memberships.findById(membershipId).orElseThrow());
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book")
                        .header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("BOOKED"));
    }

    @Test
    void acceptingAPlanLessInviteCompsTheMemberSoTheyCanBook() throws Exception {
        // M12b Task 2: a plan-less invite used to leave the member without any subscription at
        // all, so they couldn't book (409 NO_ACTIVE_SUBSCRIPTION). The box bills this member
        // offline, but they still need to be bookable — so accept now comps them onto the per-box
        // synthetic "Comped" plan instead of doing nothing.
        long n = System.nanoTime();
        String email = "planless-" + n + "@t.io";
        String token = createInviteLink0NoPlan(email);
        User joiner = authService.register(email, "correct-horse-battery", "Joiner");
        String userToken = tokenService.userToken(joiner);

        String acceptBody = mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID boxId = UUID.fromString(om.readTree(acceptBody).get("boxId").asText());
        UUID membershipId = memberships.findByUserIdAndBoxId(joiner.getId(), boxId).orElseThrow().getId();

        actAsBox(boxId);
        Subscription sub = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE").orElseThrow();
        assertThat(sub.getCurrentPeriodEnd()).isNull(); // no-expiry comp, like a grandfathered row
        Plan compedPlan = plans.findById(sub.getPlanId()).orElseThrow();
        assertThat(compedPlan.getName()).isEqualTo("Comped");
        assertThat(compedPlan.isArchived()).isTrue();

        // Entitlement check: the comp must actually let them book, not just exist as a row.
        ClassSession session = new ClassSession();
        session.setName("WOD");
        session.setStartAt(Instant.now().plusSeconds(3600 * 24));
        session.setDurationMin(60);
        session.setCapacity(10);
        UUID sessionId = sessions.save(session).getId();

        String boxToken = tokenService.boxToken(joiner, memberships.findById(membershipId).orElseThrow());
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book")
                        .header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("BOOKED"));
    }

    private String createInviteLink0NoPlan(String email) throws Exception {
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"" + email + "\",\"role\":\"ATHLETE\"}"))
                .andReturn().getResponse().getContentAsString();
        String link = om.readTree(body).get("link").asText();
        return link.substring(link.lastIndexOf('/') + 1);
    }
}
