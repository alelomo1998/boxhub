package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.AuthService;
import com.boxhub.shared.CryptoService;
import com.stripe.model.checkout.Session;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

/**
 * Covers the subscription-resolution logic in {@code StripeCheckoutService.createSession} — the
 * part the T5 webhook test could not reach. Stripe's {@code Session.create} static call is stubbed
 * with {@code mockStatic} so NOTHING hits the Stripe network; only the pre-Stripe resolution and the
 * PENDING-payment write run for real against Postgres.
 */
class StripeCheckoutServiceTest extends AbstractIntegrationTest {

    @Autowired StripeCheckoutService checkout;
    @Autowired BoxRepository boxes;
    @Autowired PlanRepository plans;
    @Autowired MembershipRepository memberships;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired BoxStripeRepository boxStripe;
    @Autowired CryptoService crypto;
    @Autowired AuthService authService;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID boxId;

    private void actAsBox(UUID id) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", id.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID membership() {
        long n = System.nanoTime();
        User u = authService.register("co-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private UUID plan() {
        Plan p = new Plan();
        p.setName("Monthly " + System.nanoTime());
        p.setDurationDays(30);
        p.setPriceCents(5000);
        p.setCurrency("eur");
        return plans.save(p).getId();
    }

    private UUID subscription(UUID membershipId, UUID planId, String status, Instant end) {
        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus(status);
        s.setPriceCents(5000);
        s.setCurrentPeriodEnd(end);
        return subscriptions.save(s).getId();
    }

    private void connectStripe() {
        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc(crypto.encrypt("rk_test_dummy"));
        bs.setWebhookSecretEnc(crypto.encrypt("whsec_dummy"));
        bs.setEnabled(true);
        boxStripe.save(bs);
    }

    private MockedStatic<Session> stubStripe() {
        Session session = mock(Session.class);
        when(session.getId()).thenReturn("cs_test_stub_" + System.nanoTime());
        when(session.getUrl()).thenReturn("https://checkout.stripe.test/pay");
        MockedStatic<Session> ms = mockStatic(Session.class);
        ms.when(() -> Session.create(any(com.stripe.param.checkout.SessionCreateParams.class),
                any(com.stripe.net.RequestOptions.class))).thenReturn(session);
        return ms;
    }

    @Test
    void lapsedMemberWithOnlyAnExpiredSubscriptionCanStartRenewalCheckout() {
        boxId = boxes.save(newBox("lapsed")).getId();
        actAsBox(boxId);
        connectStripe();
        UUID membershipId = membership();
        UUID planId = plan();
        // The member's ONLY subscription is EXPIRED — exactly who the lapse email targets.
        UUID expiredId = subscription(membershipId, planId, "EXPIRED", Instant.now().minusSeconds(3600));

        String url;
        try (MockedStatic<Session> ms = stubStripe()) {
            url = checkout.createSession(membershipId, planId); // must NOT throw NO_ACTIVE_SUBSCRIPTION
        }

        assertThat(url).isEqualTo("https://checkout.stripe.test/pay");
        // A PENDING payment was created, pointed at the member's existing (expired) row to satisfy
        // the NOT-NULL FK — the webhook repoints it to the real subscription on success.
        Payment pending = payments.findAll().stream()
                .filter(p -> membershipIsMine(p, membershipId)).findFirst().orElseThrow();
        assertThat(pending.getStatus()).isEqualTo("PENDING");
        assertThat(pending.getSubscriptionId()).isEqualTo(expiredId);
        assertThat(pending.getAmountCents()).isEqualTo(5000); // list price, integer cents
    }

    private boolean membershipIsMine(Payment p, UUID membershipId) {
        return subscriptions.findById(p.getSubscriptionId())
                .map(s -> s.getMembershipId().equals(membershipId)).orElse(false);
    }

    @Test
    void activeSubscriptionForADifferentPlanStillRequiresCancel() {
        boxId = boxes.save(newBox("switch")).getId();
        actAsBox(boxId);
        connectStripe();
        UUID membershipId = membership();
        UUID planA = plan();
        UUID planB = plan();
        subscription(membershipId, planA, "ACTIVE", Instant.now().plusSeconds(30L * 24 * 3600));

        try (MockedStatic<Session> ms = stubStripe()) {
            assertThatThrownBy(() -> checkout.createSession(membershipId, planB))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("SWITCH_REQUIRES_CANCEL");
        }
    }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("Checkout " + slug);
        b.setSlug(slug + "-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        return b;
    }
}
