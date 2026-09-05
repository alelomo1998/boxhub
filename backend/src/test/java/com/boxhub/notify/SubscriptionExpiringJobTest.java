package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.Plan;
import com.boxhub.box.PlanRepository;
import com.boxhub.box.Subscription;
import com.boxhub.box.SubscriptionRepository;
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

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SubscriptionExpiringJobTest extends AbstractIntegrationTest {

    @Autowired SubscriptionExpiringJob job;
    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

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
        b.setName("Notify " + n);
        b.setSlug("notify-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);
        return boxId;
    }

    private UUID newMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("expiring-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private record Seeded(UUID boxId, UUID membershipId) {}

    /** ACTIVE subscription whose currentPeriodEnd is exactly now + duration. */
    private Seeded seedActiveSubscriptionEndingIn(Duration duration) {
        UUID boxId = seedBox();
        UUID membershipId = newMembership(boxId);

        Plan plan = new Plan();
        plan.setName("Plan " + System.nanoTime());
        UUID planId = plans.save(plan).getId();

        Subscription sub = new Subscription();
        sub.setMembershipId(membershipId);
        sub.setPlanId(planId);
        sub.setStatus("ACTIVE");
        sub.setCurrentPeriodStart(Instant.now());
        sub.setCurrentPeriodEnd(Instant.now().plus(duration));
        subscriptions.save(sub);

        return new Seeded(boxId, membershipId);
    }

    /** ACTIVE, grandfathered subscription: currentPeriodEnd is NULL, never expiring. */
    private Seeded seedActiveSubscriptionWithNoPeriodEnd() {
        UUID boxId = seedBox();
        UUID membershipId = newMembership(boxId);

        Plan plan = new Plan();
        plan.setName("Plan " + System.nanoTime());
        UUID planId = plans.save(plan).getId();

        Subscription sub = new Subscription();
        sub.setMembershipId(membershipId);
        sub.setPlanId(planId);
        sub.setStatus("ACTIVE");
        sub.setCurrentPeriodStart(Instant.now());
        sub.setCurrentPeriodEnd(null);
        subscriptions.save(sub);

        return new Seeded(boxId, membershipId);
    }

    @Test
    void aSubscriptionEndingInsideTheWindowIsWarnedOnce() {
        var seeded = seedActiveSubscriptionEndingIn(Duration.ofDays(10));

        job.sweepBox(seeded.boxId());
        job.sweepBox(seeded.boxId());   // the second night, and the third, and the fourteenth

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.SUBSCRIPTION_EXPIRING.name());
            assertThat(n.getMembershipId()).isEqualTo(seeded.membershipId());
        });
    }

    @Test
    void aSubscriptionEndingOutsideTheWindowIsNotWarned() {
        var seeded = seedActiveSubscriptionEndingIn(Duration.ofDays(30));

        job.sweepBox(seeded.boxId());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aGrandfatheredSubscriptionWithNoEndIsNeverExpiring() {
        var seeded = seedActiveSubscriptionWithNoPeriodEnd();

        job.sweepBox(seeded.boxId());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void theWindowIsTheOneSharedConstant() {
        // 13 days out is inside EXPIRING_SOON_DAYS (14) and outside the 7 HomeController used to
        // hardcode. If this fails, Task 1 was reverted and the banner disagrees with this badge.
        var seeded = seedActiveSubscriptionEndingIn(Duration.ofDays(13));

        job.sweepBox(seeded.boxId());

        assertThat(notifications.count()).isOne();
    }
}
