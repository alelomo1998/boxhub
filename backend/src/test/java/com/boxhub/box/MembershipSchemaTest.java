package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MembershipSchemaTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired PlanRepository plans;
    @Autowired MembershipRepository memberships;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired BoxStripeRepository boxStripes;
    @Autowired AuthService authService;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Schema " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("schema-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    @Test
    void planRoundTripsPriceCurrencyAndEntitlement() {
        UUID boxId = newBoxId("plan-" + System.nanoTime());
        actAsBox(boxId);

        Plan p = new Plan();
        p.setName("Unlimited Monthly");
        p.setDurationDays(30);
        p.setPriceCents(4999);
        p.setCurrency("eur");
        p.setEntitlement("UNLIMITED");
        Plan saved = plans.save(p);

        Plan reloaded = plans.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getPriceCents()).isEqualTo(4999);
        assertThat(reloaded.getCurrency()).isEqualTo("eur");
        assertThat(reloaded.getEntitlement()).isEqualTo("UNLIMITED");
    }

    @Test
    void subscriptionSavesAndIsFoundByMembershipAndStatus() {
        UUID boxId = newBoxId("sub-" + System.nanoTime());
        actAsBox(boxId);

        Plan p = new Plan();
        p.setName("Weekly Limit Plan");
        p.setDurationDays(30);
        p.setPriceCents(2000);
        p.setCurrency("eur");
        p.setEntitlement("WEEKLY_LIMIT");
        Plan plan = plans.save(p);

        UUID membershipId = newMembership(boxId);

        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(plan.getId());
        s.setStatus("ACTIVE");
        s.setPriceCents(2000);
        s.setCurrentPeriodEnd(Instant.now().plusSeconds(3600L * 24 * 30));
        subscriptions.save(s);

        Subscription found = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE").orElseThrow();
        assertThat(found.getPlanId()).isEqualTo(plan.getId());
        assertThat(found.getPriceCents()).isEqualTo(2000);
        assertThat(found.getCurrentPeriodEnd()).isNotNull();
    }

    @Test
    void paymentSavesAndIsFoundByStripeSessionId() {
        UUID boxId = newBoxId("pay-" + System.nanoTime());
        actAsBox(boxId);

        Plan p = new Plan();
        p.setName("Plan");
        p.setDurationDays(30);
        Plan plan = plans.save(p);
        UUID membershipId = newMembership(boxId);

        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(plan.getId());
        s.setStatus("ACTIVE");
        s.setPriceCents(2000);
        Subscription sub = subscriptions.save(s);

        String sessionId = "cs_test_" + System.nanoTime();
        Payment pay = new Payment();
        pay.setSubscriptionId(sub.getId());
        pay.setAmountCents(2000);
        pay.setCurrency("eur");
        pay.setMethod("STRIPE");
        pay.setStatus("SUCCEEDED");
        pay.setStripeSessionId(sessionId);
        payments.save(pay);

        Payment found = payments.findByStripeSessionId(sessionId).orElseThrow();
        assertThat(found.getAmountCents()).isEqualTo(2000);
        assertThat(found.getMethod()).isEqualTo("STRIPE");
        assertThat(found.getStatus()).isEqualTo("SUCCEEDED");
    }

    @Test
    void boxStripeSavesAndIsFoundByBoxId() {
        UUID boxId = newBoxId("stripe-" + System.nanoTime());

        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc("enc-key");
        bs.setWebhookSecretEnc("enc-secret");
        bs.setEnabled(true);
        boxStripes.save(bs);

        BoxStripe found = boxStripes.findByBoxId(boxId).orElseThrow();
        assertThat(found.getRestrictedKeyEnc()).isEqualTo("enc-key");
        assertThat(found.getWebhookSecretEnc()).isEqualTo("enc-secret");
        assertThat(found.isEnabled()).isTrue();
    }
}
