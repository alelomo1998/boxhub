package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.BoxStripe;
import com.boxhub.box.BoxStripeRepository;
import com.boxhub.box.Payment;
import com.boxhub.box.PaymentRepository;
import com.boxhub.box.Plan;
import com.boxhub.box.PlanRepository;
import com.boxhub.box.Subscription;
import com.boxhub.box.SubscriptionRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.CryptoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Task 8: MEMBERSHIP_BLOCKED, PAYMENT_FAILED, INVITE_ACCEPTED. NEW_MEMBER_JOINED is declared but
 * deliberately never emitted in M29b — see the exclusivity test below. No shared
 * fixtures across notify tests (see docs) — box/membership seeding is copied and adapted from
 * BookingNotificationTest / AnnouncementNotificationTest / StripeWebhookTest / InviteSubscriptionTest.
 */
class MembershipNotificationTest extends AbstractIntegrationTest {

    private static final String WEBHOOK_SECRET = "whsec_test_signing_secret_for_membership_notify_1234567890";

    @Autowired MockMvc mvc;
    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired BoxStripeRepository boxStripe;
    @Autowired CryptoService crypto;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID seedBox() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Notify Mem " + n);
        b.setSlug("notify-mem-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        return boxes.save(b).getId();
    }

    private record Admin(UUID membershipId, String boxToken) {}

    private Admin seedAdmin(UUID boxId) {
        long n = System.nanoTime();
        Box box = boxes.findById(boxId).orElseThrow();
        User u = authService.register("mem-admin-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Admin " + n);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        UUID membershipId = memberships.save(m).getId();
        return new Admin(membershipId, tokenService.boxToken(u, m));
    }

    private record Member(UUID membershipId, UUID boxId, String adminToken) {}

    private Member seedAthleteMembership(String status) {
        UUID boxId = seedBox();
        Admin admin = seedAdmin(boxId);
        long n = System.nanoTime();
        Box box = boxes.findById(boxId).orElseThrow();
        User u = authService.register("mem-ath-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Athlete " + n);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        m.setStatus(status);
        UUID membershipId = memberships.save(m).getId();
        return new Member(membershipId, boxId, admin.boxToken());
    }

    private Member seedActiveAthleteMembership() { return seedAthleteMembership("ACTIVE"); }
    private Member seedSuspendedAthleteMembership() { return seedAthleteMembership("SUSPENDED"); }

    private String suspendRequest() { return "{\"status\":\"SUSPENDED\"}"; }
    private String activateRequest() { return "{\"status\":\"ACTIVE\"}"; }

    private void patchMember(Member member, String body) throws Exception {
        mvc.perform(patch("/api/box/members/" + member.membershipId())
                        .header("Authorization", "Bearer " + member.adminToken())
                        .contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    @Test
    void suspendingAMemberTellsThem() throws Exception {
        var member = seedActiveAthleteMembership();

        patchMember(member, suspendRequest());

        actAsBox(member.boxId());
        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.MEMBERSHIP_BLOCKED.name());
            assertThat(n.getMembershipId()).isEqualTo(member.membershipId());
            // Being unable to book with no explanation is the worst version of this.
            assertThat(n.getLink()).isEqualTo("/athlete/membership");
        });
    }

    @Test
    void reactivatingAMemberDoesNotFireTheBlockedEvent() throws Exception {
        var member = seedSuspendedAthleteMembership();

        patchMember(member, activateRequest());

        actAsBox(member.boxId());
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aNoOpStatusPatchFiresNothing() throws Exception {
        var member = seedActiveAthleteMembership();

        patchMember(member, activateRequest()); // already ACTIVE

        // MemberController already guards MembershipEvent on an actual transition; this must too.
        actAsBox(member.boxId());
        assertThat(notifications.count()).isZero();
    }

    private record TwoAdmins(UUID boxId, List<UUID> membershipIds, String adminToken) {}

    private TwoAdmins seedTwoActiveBoxAdmins() {
        UUID boxId = seedBox();
        Admin a1 = seedAdmin(boxId);
        Admin a2 = seedAdmin(boxId);
        return new TwoAdmins(boxId, List.of(a1.membershipId(), a2.membershipId()), a1.boxToken());
    }

    private record PendingInvite(String token, String inviteeToken) {}

    private PendingInvite seedPendingInvite(TwoAdmins admins) throws Exception {
        return seedPendingInvite(admins, "ATHLETE");
    }

    private PendingInvite seedPendingInvite(TwoAdmins admins, String role) throws Exception {
        long n = System.nanoTime();
        String email = "invitee-" + n + "-" + Math.random() + "@t.io";
        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + admins.adminToken())
                        .content("{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String link = om.readTree(body).get("link").asText();
        String token = link.substring(link.lastIndexOf('/') + 1);

        User invitee = authService.register(email, "correct-horse-battery", "Invitee " + n);
        return new PendingInvite(token, tokenService.userToken(invitee));
    }

    private void acceptInvite(PendingInvite invite) throws Exception {
        mvc.perform(post("/api/invites/" + invite.token() + "/accept")
                        .header("Authorization", "Bearer " + invite.inviteeToken()))
                .andExpect(status().isOk());
    }

    @Test
    void acceptingAnInviteTellsEveryBoxAdmin() throws Exception {
        var admins = seedTwoActiveBoxAdmins();

        acceptInvite(seedPendingInvite(admins));

        actAsBox(admins.boxId());
        var rows = notifications.findAll().stream()
                .filter(n -> NotificationType.INVITE_ACCEPTED.name().equals(n.getType())).toList();
        assertThat(rows).extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(admins.membershipIds());
    }

    @Test
    void anAdminAcceptingAnAdminInviteIsNotToldAboutThemselves() throws Exception {
        var admins = seedTwoActiveBoxAdmins();

        // A BOX_ADMIN-role invite makes the acceptor an ACTIVE box admin, so an unfiltered admin
        // audience would include them and tell them they accepted their own invite.
        acceptInvite(seedPendingInvite(admins, "BOX_ADMIN"));

        actAsBox(admins.boxId());
        var accepted = notifications.findAll().stream()
                .filter(n -> NotificationType.INVITE_ACCEPTED.name().equals(n.getType())).toList();

        // Exactly the two pre-existing admins — the third admin (the acceptor) hears nothing.
        assertThat(accepted).hasSize(2)
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(admins.membershipIds());
    }

    @Test
    void acceptingAnInviteDoesNotAlsoFireNewMemberJoined() throws Exception {
        var admins = seedTwoActiveBoxAdmins();

        acceptInvite(seedPendingInvite(admins));

        actAsBox(admins.boxId());
        var rows = notifications.findAll();

        // D-14: both events would otherwise fire at InvitePublicController, giving admins two rows
        // for one person joining. They are mutually exclusive by construction, not by filtering.
        //
        // In M29b the exclusivity is total: NEW_MEMBER_JOINED is emitted NOWHERE. Its only candidate
        // site was BoxSignupService, which creates a box together with its owner — so the only
        // ACTIVE box admin at that instant is the person who just signed up, and the row would tell
        // them they themselves joined. Invite acceptance is the sole way into an existing box, and
        // that is INVITE_ACCEPTED's. Re-check this test when a non-invite join path ships.
        var accepted = rows.stream().filter(n -> NotificationType.INVITE_ACCEPTED.name().equals(n.getType())).toList();
        assertThat(accepted).hasSize(2); // both admins actually got told — makes the noneSatisfy below non-vacuous
        assertThat(rows)
                .noneSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.NEW_MEMBER_JOINED.name()));
    }

    private record SeededPayment(UUID boxId, UUID membershipId, UUID subscriptionId, String sessionId) {}

    private SeededPayment seedMemberWithSubscription() {
        UUID boxId = seedBox();
        actAsBox(boxId);
        long n = System.nanoTime();
        Box box = boxes.findById(boxId).orElseThrow();
        User u = authService.register("mem-pay-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Payer " + n);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        Plan p = new Plan();
        p.setName("Plan " + n);
        p.setDurationDays(30);
        p.setPriceCents(5000);
        p.setCurrency("eur");
        UUID planId = plans.save(p).getId();

        Subscription sub = new Subscription();
        sub.setMembershipId(membershipId);
        sub.setPlanId(planId);
        sub.setStatus("ACTIVE");
        sub.setPriceCents(0);
        UUID subscriptionId = subscriptions.save(sub).getId();

        String sessionId = "cs_test_" + n + "_" + UUID.randomUUID();
        Payment payment = new Payment();
        payment.setSubscriptionId(subscriptionId);
        payment.setAmountCents(5000);
        payment.setCurrency("eur");
        payment.setMethod("STRIPE");
        payment.setStatus("PENDING");
        payment.setStripeSessionId(sessionId);
        payments.save(payment);

        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc(crypto.encrypt("rk_test_dummy_restricted_key"));
        bs.setWebhookSecretEnc(crypto.encrypt(WEBHOOK_SECRET));
        bs.setEnabled(true);
        boxStripe.save(bs);

        return new SeededPayment(boxId, membershipId, subscriptionId, sessionId);
    }

    /** Stripe's documented webhook signing scheme — a pure local HMAC, no network involved
     *  (copied from StripeWebhookTest, which drives this same endpoint the same way). */
    private String signatureHeader(String payload, String secret) throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        String signedPayload = timestamp + "." + payload;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
        return "t=" + timestamp + ",v1=" + HexFormat.of().formatHex(hash);
    }

    private void deliverStripePaymentFailedWebhook(String sessionId) throws Exception {
        String payload = "{\"type\":\"checkout.session.async_payment_failed\",\"data\":{\"object\":{\"id\":\""
                + sessionId + "\",\"payment_status\":\"unpaid\"}}}";
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(payload, WEBHOOK_SECRET)).content(payload))
                .andExpect(status().isOk());
    }

    @Test
    void aFailedPaymentReachesTheFeedAsWellAsTheInbox() throws Exception {
        var member = seedMemberWithSubscription();

        deliverStripePaymentFailedWebhook(member.sessionId());

        actAsBox(member.boxId());
        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.PAYMENT_FAILED.name());
            assertThat(n.getMembershipId()).isEqualTo(member.membershipId());
            // The row must carry this box's id, not the root sentinel: the webhook has no JWT and
            // runs inside runAsBox. A sentinel box_id would make the row invisible to its reader.
            assertThat(n.getBoxId()).isEqualTo(member.boxId());
        });
    }
}
