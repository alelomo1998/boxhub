package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.shared.Mailer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Exercises SubscriptionLapseJob.sweepBox directly (the unit sweepAll loops over) rather than
 * waiting on the cron — same convention as SessionGenerator-style jobs. Every assertion reads
 * persisted state after re-establishing the box tenant (MockMvc isn't involved here, but the job
 * itself flips SecurityContextHolder back to whatever was active before it ran, same as
 * StripeWebhookTest's actAsBox re-establishment note).
 */
class SubscriptionLapseTest extends AbstractIntegrationTest {

    @Autowired SubscriptionLapseJob lapseJob;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired AuthService authService;
    @MockitoBean Mailer mailer;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Lapse " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private record NewMember(UUID membershipId, String email) {}

    private NewMember newMembership(UUID boxId, String emailPrefix) {
        long n = System.nanoTime();
        // Lowercased at construction: registration stores the address lowercased, and Math.random()
        // renders in scientific notation with an UPPERCASE E when the draw is < 1e-3 (~0.1% of runs),
        // so the raw string stopped matching what the mailer was actually called with. A real flake,
        // hit on 2026-08-28; pre-dates M29a (last touched in M16a).
        String email = (emailPrefix + "-" + n + "-" + Math.random() + "@t.io").toLowerCase();
        User u = authService.register(email, "correct-horse-battery", "Lapsing Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return new NewMember(memberships.save(m).getId(), email);
    }

    private UUID newPlan() {
        Plan p = new Plan();
        p.setName("Lapse Plan " + System.nanoTime());
        p.setDurationDays(30);
        p.setPriceCents(4000);
        p.setCurrency("eur");
        return plans.save(p).getId();
    }

    private UUID newSubscription(UUID membershipId, UUID planId, String status, Instant end) {
        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus(status);
        s.setPriceCents(4000);
        s.setCurrentPeriodEnd(end);
        return subscriptions.save(s).getId();
    }

    @Test
    void pastEndActiveFlipsToExpiredAndMailsGrandfatheredAndAlreadyExpiredAreUntouched() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));

        UUID boxId = newBox("lapse-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan();

        NewMember due = newMembership(boxId, "due");
        UUID dueSubId = newSubscription(due.membershipId(), planId, "ACTIVE", Instant.now().minusSeconds(3600));

        NewMember grandfathered = newMembership(boxId, "grand");
        UUID grandfatheredSubId = newSubscription(grandfathered.membershipId(), planId, "ACTIVE", null);

        NewMember alreadyExpired = newMembership(boxId, "exp");
        UUID alreadyExpiredSubId = newSubscription(alreadyExpired.membershipId(), planId, "EXPIRED",
                Instant.now().minusSeconds(7200));

        lapseJob.sweepBox(boxId);

        actAsBox(boxId);
        assertThat(subscriptions.findById(dueSubId).orElseThrow().getStatus()).isEqualTo("EXPIRED");
        assertThat(subscriptions.findById(grandfatheredSubId).orElseThrow().getStatus()).isEqualTo("ACTIVE");
        assertThat(subscriptions.findById(alreadyExpiredSubId).orElseThrow().getStatus()).isEqualTo("EXPIRED");

        // exactly one lapse mail, for the member whose subscription actually flipped
        verify(mailer, times(1)).send(eq(due.email()), any(), eq("subscription-lapsed"), any());
    }

    @Test
    void sweepAllFlipsDueSubscriptionsInEveryBoxNotJustOne() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));

        // Two boxes, each with a past-due ACTIVE subscription. sweepAll() must reach both — the
        // whole point of the cross-box loop; a job that silently swept nothing (the @TenantId trap)
        // or only the first box would leave one of these ACTIVE.
        UUID boxA = newBox("sweepall-a-" + System.nanoTime());
        actAsBox(boxA);
        NewMember a = newMembership(boxA, "a");
        UUID subA = newSubscription(a.membershipId(), newPlan(), "ACTIVE", Instant.now().minusSeconds(3600));

        UUID boxB = newBox("sweepall-b-" + System.nanoTime());
        actAsBox(boxB);
        NewMember b = newMembership(boxB, "b");
        UUID subB = newSubscription(b.membershipId(), newPlan(), "ACTIVE", Instant.now().minusSeconds(3600));

        SecurityContextHolder.clearContext(); // the @Scheduled entry point runs tenant-less
        lapseJob.sweepAll();

        actAsBox(boxA);
        assertThat(subscriptions.findById(subA).orElseThrow().getStatus()).isEqualTo("EXPIRED");
        actAsBox(boxB);
        assertThat(subscriptions.findById(subB).orElseThrow().getStatus()).isEqualTo("EXPIRED");

        verify(mailer, times(1)).send(eq(a.email()), any(), eq("subscription-lapsed"), any());
        verify(mailer, times(1)).send(eq(b.email()), any(), eq("subscription-lapsed"), any());
    }
}
