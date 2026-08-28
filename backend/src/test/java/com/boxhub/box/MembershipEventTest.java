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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * M39 Task 2: the membership lifecycle event (V29's {@code membership_event}, added by this
 * milestone). Covers the three write sites reachable through the API — {@link InvitePublicController#accept},
 * {@link BoxSignupService#signup}, {@link MemberController#patch} — and the {@code @TenantId}
 * isolation the entity relies on (docs/TENANCY.md §1). {@link com.boxhub.shared.DevDataSeeder}'s
 * write site is NOT covered here — it creates memberships outside any box tenant (see the
 * executor's report), so no JOINED event is written from there.
 */
class MembershipEventTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired MembershipEventRepository membershipEvents;
    @Autowired PlatformSettings settings;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    Box box;
    String adminToken;
    Membership adminMembership;

    @BeforeEach
    void setup() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
        // OPEN + headroom so signupBoxCreatesAJoinedEventForTheOwner doesn't need approval and
        // never trips the suite-wide MAX_BOXES cap (same reasoning as BoxSignupTest/CompSubscriptionTest).
        settings.set(PlatformSettings.SIGNUP_MODE, "OPEN");
        settings.set(PlatformSettings.MAX_BOXES, "1000000");

        long n = System.nanoTime();
        box = new Box();
        box.setName("Evt Box " + n);
        box.setSlug("evt-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);
        User admin = authService.register("evtadm-" + n + "@t.io", "correct-horse-battery", "Evt Admin");
        adminMembership = member(box, admin, "BOX_ADMIN");
        adminToken = tokenService.boxToken(admin, adminMembership);
    }

    @AfterEach
    void restore() {
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL");
        settings.set(PlatformSettings.MAX_BOXES, "100");
        SecurityContextHolder.clearContext();
    }

    private Membership member(Box b, User u, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole(role);
        return memberships.save(m);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    /** Reads a membership's timeline under boxId's tenant, restoring a clean context after. */
    private List<MembershipEvent> timelineUnder(UUID boxId, UUID membershipId) {
        actAsBox(boxId);
        List<MembershipEvent> events = membershipEvents.findByMembershipIdOrderByCreatedAtAsc(membershipId);
        SecurityContextHolder.clearContext();
        return events;
    }

    private String createInviteLink(String email, String role) throws Exception {
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String link = om.readTree(body).get("link").asText();
        return link.substring(link.lastIndexOf('/') + 1);
    }

    @Test
    void inviteAcceptWritesExactlyOneJoinedEvent() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("joiner-" + n + "@t.io", "ATHLETE");
        User joiner = authService.register("joiner-" + n + "@t.io", "correct-horse-battery", "Joiner");
        String userToken = tokenService.userToken(joiner);

        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());

        Membership joinerMembership = memberships.findByUserIdAndBoxId(joiner.getId(), box.getId()).orElseThrow();
        List<MembershipEvent> events = timelineUnder(box.getId(), joinerMembership.getId());

        assertThat(events).hasSize(1);
        assertThat(events.get(0).getKind()).isEqualTo(MembershipEvent.JOINED);
        assertThat(events.get(0).getMembershipId()).isEqualTo(joinerMembership.getId());
        assertThat(events.get(0).getBoxId()).isEqualTo(box.getId());
    }

    /** The OTHER branch of accept() (invite carries a planId) — a separate call site in
     * InvitePublicController, so it needs its own proof it writes exactly one event too. */
    @Test
    void inviteAcceptWithAPlanStillWritesExactlyOneJoinedEvent() throws Exception {
        long n = System.nanoTime();
        String planBody = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Evt Plan " + n + "\",\"durationDays\":30}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String planId = om.readTree(planBody).get("id").asText();

        String inviteBody = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"planjoin-" + n + "@t.io\",\"role\":\"ATHLETE\",\"planId\":\"" + planId + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String link = om.readTree(inviteBody).get("link").asText();
        String token = link.substring(link.lastIndexOf('/') + 1);

        User joiner = authService.register("planjoin-" + n + "@t.io", "correct-horse-battery", "Plan Joiner");
        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + tokenService.userToken(joiner)))
                .andExpect(status().isOk());

        Membership joinerMembership = memberships.findByUserIdAndBoxId(joiner.getId(), box.getId()).orElseThrow();
        List<MembershipEvent> events = timelineUnder(box.getId(), joinerMembership.getId());

        assertThat(events).hasSize(1);
        assertThat(events.get(0).getKind()).isEqualTo(MembershipEvent.JOINED);
    }

    @Test
    void signupBoxCreatesAJoinedEventForTheOwner() throws Exception {
        long n = System.nanoTime();
        String email = "signup-owner-" + n + "@t.io";
        mvc.perform(post("/api/auth/signup-box").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"boxName":"Signup Box %d","name":"Owner","email":"%s","password":"correct-horse-battery"}
                """.formatted(n, email)))
                .andExpect(status().isCreated());

        User owner = users.findByEmail(email).orElseThrow();
        List<Membership> mems = memberships.findByUserIdWithBox(owner.getId());
        assertThat(mems).hasSize(1);
        Membership ownerMembership = mems.get(0);
        UUID ownerBoxId = ownerMembership.getBox().getId();

        List<MembershipEvent> events = timelineUnder(ownerBoxId, ownerMembership.getId());

        assertThat(events).hasSize(1);
        assertThat(events.get(0).getKind()).isEqualTo(MembershipEvent.JOINED);
        assertThat(events.get(0).getBoxId()).isEqualTo(ownerBoxId);
    }

    @Test
    void suspendThenReactivateWritesEventsInOrderAfterJoin() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("evtath-" + n + "@t.io", "ATHLETE");
        User athleteUser = authService.register("evtath-" + n + "@t.io", "correct-horse-battery", "Evt Athlete");
        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + tokenService.userToken(athleteUser)))
                .andExpect(status().isOk());
        Membership athleteMembership = memberships.findByUserIdAndBoxId(athleteUser.getId(), box.getId()).orElseThrow();

        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isOk());

        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isOk());

        List<MembershipEvent> events = timelineUnder(box.getId(), athleteMembership.getId());

        assertThat(events).extracting(MembershipEvent::getKind)
                .containsExactly(MembershipEvent.JOINED, MembershipEvent.SUSPENDED, MembershipEvent.REACTIVATED);
        // actor: the acting admin's OWN membership id in this box (MemberController#patch resolves
        // it via memberships.findByUserIdAndBoxId(TenantContext.userId(), boxId)).
        assertThat(events.get(1).getActorMembershipId()).isEqualTo(adminMembership.getId());
        assertThat(events.get(2).getActorMembershipId()).isEqualTo(adminMembership.getId());
    }

    /** The one most likely to be got wrong: a PATCH that requests the status the member is
     * ALREADY at must write nothing. Negative control run and reverted — see executor report. */
    @Test
    void noOpStatusPatchWritesNoEvent() throws Exception {
        long n = System.nanoTime();
        User athleteUser = authService.register("evtnoop-" + n + "@t.io", "correct-horse-battery", "Evt Noop");
        Membership athleteMembership = member(box, athleteUser, "ATHLETE"); // defaults to ACTIVE

        mvc.perform(patch("/api/box/members/" + athleteMembership.getId())
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isOk());

        assertThat(timelineUnder(box.getId(), athleteMembership.getId())).isEmpty();
    }

    @Test
    void aSecondBoxsAdminCannotSeeTheFirstBoxsEvents() throws Exception {
        long n = System.nanoTime();
        String token = createInviteLink("evtcross-" + n + "@t.io", "ATHLETE");
        User joiner = authService.register("evtcross-" + n + "@t.io", "correct-horse-battery", "Evt Cross");
        mvc.perform(post("/api/invites/" + token + "/accept")
                        .header("Authorization", "Bearer " + tokenService.userToken(joiner)))
                .andExpect(status().isOk());
        Membership joinerMembership = memberships.findByUserIdAndBoxId(joiner.getId(), box.getId()).orElseThrow();

        Box otherBox = new Box();
        otherBox.setName("Evt Other Box " + n);
        otherBox.setSlug("evt-other-" + n);
        otherBox.setTimezone("Europe/Rome");
        boxes.save(otherBox);

        // Sanity: box A's own tenant sees the event.
        assertThat(timelineUnder(box.getId(), joinerMembership.getId())).hasSize(1);

        // Same membership id, read under box B's tenant: @TenantId adds "AND box_id = B" to the
        // derived query, and joinerMembership's row carries box A's id, so this returns EMPTY even
        // though the id is real. This assertion is meaningful ONLY because MembershipEvent carries
        // the @TenantId discriminator — drop it and this read would see the row (docs/TENANCY.md §1).
        assertThat(timelineUnder(otherBox.getId(), joinerMembership.getId())).isEmpty();
    }
}
