package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * M12b Task 2: the self-serve box owner and a plan-less invitee both used to end up with a
 * membership but NO subscription, so the entitlement gate (BookingEntitlementTest) rejected every
 * booking attempt with 409 NO_ACTIVE_SUBSCRIPTION. Fix: comp both onto a per-box synthetic
 * "Comped" plan (archived, price 0, UNLIMITED, no-expiry ACTIVE subscription) — same wall V14's
 * grandfather migration hit, same shape of fix.
 *
 * Every assertion here is BOOKING, not "a subscription row exists" — a row the entitlement gate
 * still rejects (wrong status, wrong entitlement, expired period) would pass a row-only assertion
 * just as happily as a real fix.
 */
class CompSubscriptionTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired ClassSessionRepository sessions;
    @Autowired PlatformSettings settings;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    @BeforeEach
    void setup() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
        // OPEN mode: signup-box creates an ACTIVE box synchronously, no admin approval to wait on.
        settings.set(PlatformSettings.SIGNUP_MODE, "OPEN");
        // Headroom so this class never trips the global MAX_BOXES cap (see BoxSignupTest ponytail note).
        settings.set(PlatformSettings.MAX_BOXES, "1000000");
    }

    @AfterEach
    void restore() {
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL");
        settings.set(PlatformSettings.MAX_BOXES, "100");
        SecurityContextHolder.clearContext();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newSession(UUID boxId) {
        actAsBox(boxId);
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(10);
        UUID id = sessions.save(s).getId();
        SecurityContextHolder.clearContext();
        return id;
    }

    @Test
    void aSelfServeOwnerCanBookTheirOwnClasses() throws Exception {
        long n = System.nanoTime();
        String email = "comp-owner-" + n + "@t.io";
        mvc.perform(post("/api/auth/signup-box").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"boxName":"Comp Owner Box %s","name":"Owner","email":"%s","password":"correct-horse-battery"}
                """.formatted(n, email)))
                .andExpect(status().isCreated());

        User owner = users.findByEmail(email).orElseThrow();
        Membership membership = memberships.findByUserIdWithBox(owner.getId()).get(0);
        UUID boxId = membership.getBox().getId();
        String boxToken = tokenService.boxToken(owner, membership);

        UUID sessionId = newSession(boxId);

        mvc.perform(post("/api/box/sessions/" + sessionId + "/book")
                        .header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("BOOKED"));
    }

    @Test
    void aMemberInvitedWithNoPlanCanBook() throws Exception {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Comp Invite Box " + n);
        box.setSlug("comp-invite-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);
        User admin = authService.register("comp-adm-" + n + "@t.io", "correct-horse-battery", "Adm");
        Membership adminM = new Membership();
        adminM.setUser(admin);
        adminM.setBox(box);
        adminM.setRole("BOX_ADMIN");
        memberships.save(adminM);
        String adminToken = tokenService.boxToken(admin, adminM);

        String email = "comp-invitee-" + n + "@t.io";
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"" + email + "\",\"role\":\"ATHLETE\"}"))
                .andReturn().getResponse().getContentAsString();
        String token = om.readTree(body).get("link").asText().substring("/join/".length());

        User joiner = authService.register(email, "correct-horse-battery", "Joiner");
        String userToken = tokenService.userToken(joiner);
        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());

        Membership membership = memberships.findByUserIdAndBoxId(joiner.getId(), box.getId()).orElseThrow();
        String boxToken = tokenService.boxToken(joiner, membership);

        UUID sessionId = newSession(box.getId());

        mvc.perform(post("/api/box/sessions/" + sessionId + "/book")
                        .header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("BOOKED"));
    }

    @Test
    void theCompedPlanIsArchivedSoItNeverShowsInThePlansList() throws Exception {
        long n = System.nanoTime();
        String email = "comp-plans-" + n + "@t.io";
        mvc.perform(post("/api/auth/signup-box").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"boxName":"Comp Plans Box %s","name":"Owner","email":"%s","password":"correct-horse-battery"}
                """.formatted(n, email)))
                .andExpect(status().isCreated());

        User owner = users.findByEmail(email).orElseThrow();
        Membership membership = memberships.findByUserIdWithBox(owner.getId()).get(0);
        UUID boxId = membership.getBox().getId();
        String boxToken = tokenService.boxToken(owner, membership);

        actAsBox(boxId);
        Plan comped = plans.findByBoxIdAndName(boxId, "Comped").orElseThrow();
        assertThat(comped.isArchived()).isTrue();
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/plans").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("Comped"))));
    }
}
