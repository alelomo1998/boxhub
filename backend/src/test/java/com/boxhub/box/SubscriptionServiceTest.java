package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SubscriptionServiceTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired PlanRepository plans;
    @Autowired MembershipRepository memberships;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired AuthService authService;
    @Autowired SubscriptionService subscriptionService;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Sub " + slug);
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
        User u = authService.register("sub-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private UUID newPlan(int durationDays) {
        Plan p = new Plan();
        p.setName("Plan " + System.nanoTime() + "-" + Math.random());
        p.setDurationDays(durationDays);
        p.setPriceCents(3000);
        p.setCurrency("eur");
        p.setEntitlement("UNLIMITED");
        return plans.save(p).getId();
    }

    @Test
    void newSubscriptionEndsAtNowPlusDuration() {
        UUID boxId = newBoxId("new-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        Instant before = Instant.now();
        Subscription sub = subscriptionService.recordPeriod(membershipId, planId, 3000, null);
        Instant after = Instant.now();

        assertThat(sub.getStatus()).isEqualTo("ACTIVE");
        assertThat(sub.getPlanId()).isEqualTo(planId);
        assertThat(sub.getPriceCents()).isEqualTo(3000);
        assertThat(sub.getCurrentPeriodEnd()).isNotNull();
        assertThat(sub.getCurrentPeriodEnd()).isAfter(before.plusSeconds(29L * 24 * 3600));
        assertThat(sub.getCurrentPeriodEnd()).isBefore(after.plusSeconds(31L * 24 * 3600));
    }

    @Test
    void secondRecordPeriodForSamePlanExtendsFromPriorEndNotFromNow() {
        UUID boxId = newBoxId("ext-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        Subscription first = subscriptionService.recordPeriod(membershipId, planId, 3000, null);
        Instant firstStart = first.getCurrentPeriodStart();
        Instant firstEnd = first.getCurrentPeriodEnd();

        Subscription second = subscriptionService.recordPeriod(membershipId, planId, 3000, null);

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(second.getCurrentPeriodEnd()).isEqualTo(firstEnd.plusSeconds(30L * 24 * 3600));
        // Both ends of the period move together — a renewal's receipt reads the real one-period
        // term, not one stretching back to the row's original creation time.
        assertThat(second.getCurrentPeriodStart()).isEqualTo(firstEnd);
        assertThat(second.getCurrentPeriodStart()).isNotEqualTo(firstStart);
    }

    @Test
    void recordPeriodForDifferentPlanWhileActiveThrowsSwitchRequiresCancel() {
        UUID boxId = newBoxId("switch-" + System.nanoTime());
        actAsBox(boxId);
        UUID planA = newPlan(30);
        UUID planB = newPlan(30);
        UUID membershipId = newMembership(boxId);

        subscriptionService.recordPeriod(membershipId, planA, 3000, null);

        assertThatThrownBy(() -> subscriptionService.recordPeriod(membershipId, planB, 3000, null))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("SWITCH_REQUIRES_CANCEL");
                });
    }

    @Test
    void afterCancelANewPlanCanBeRecorded() {
        UUID boxId = newBoxId("cancel-" + System.nanoTime());
        actAsBox(boxId);
        UUID planA = newPlan(30);
        UUID planB = newPlan(30);
        UUID membershipId = newMembership(boxId);

        Subscription first = subscriptionService.recordPeriod(membershipId, planA, 3000, null);
        subscriptionService.cancel(first.getId());

        Subscription second = subscriptionService.recordPeriod(membershipId, planB, 2500, "discount");

        assertThat(second.getPlanId()).isEqualTo(planB);
        assertThat(second.getStatus()).isEqualTo("ACTIVE");
        assertThat(second.getPriceCents()).isEqualTo(2500);
        assertThat(second.getPriceNote()).isEqualTo("discount");

        Subscription reloadedFirst = subscriptions.findById(first.getId()).orElseThrow();
        assertThat(reloadedFirst.getStatus()).isEqualTo("CANCELED");
    }

    @Test
    void extendFromLapsedStartsFreshFromNowNotStaleEnd() {
        UUID boxId = newBoxId("lapse-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        // Manually create an ACTIVE subscription whose period already ended in the past.
        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus("ACTIVE");
        s.setPriceCents(3000);
        s.setCurrentPeriodEnd(Instant.now().minusSeconds(10L * 24 * 3600));
        subscriptions.save(s);

        Instant before = Instant.now();
        Subscription extended = subscriptionService.recordPeriod(membershipId, planId, 3000, null);
        Instant after = Instant.now();

        // Fresh from now, not from the stale past end (which would put it ~20 days from now).
        assertThat(extended.getCurrentPeriodEnd()).isAfter(before.plusSeconds(29L * 24 * 3600));
        assertThat(extended.getCurrentPeriodEnd()).isBefore(after.plusSeconds(31L * 24 * 3600));
    }

    @Test
    void grandfatheredNullEndPlusRecordPeriodSetsConcreteEnd() {
        UUID boxId = newBoxId("grand-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus("ACTIVE");
        s.setPriceCents(0);
        s.setCurrentPeriodEnd(null);
        subscriptions.save(s);

        Instant before = Instant.now();
        Subscription result = subscriptionService.recordPeriod(membershipId, planId, 3000, null);
        Instant after = Instant.now();

        assertThat(result.getCurrentPeriodEnd()).isNotNull();
        assertThat(result.getCurrentPeriodEnd()).isAfter(before.plusSeconds(29L * 24 * 3600));
        assertThat(result.getCurrentPeriodEnd()).isBefore(after.plusSeconds(31L * 24 * 3600));
        assertThat(result.getPriceCents()).isEqualTo(3000);
    }

    @Test
    void activeForReturnsGrandfatheredNullEndSubscription() {
        UUID boxId = newBoxId("active-grand-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus("ACTIVE");
        s.setPriceCents(0);
        s.setCurrentPeriodEnd(null);
        subscriptions.save(s);

        assertThat(subscriptionService.activeFor(membershipId)).isPresent();
    }

    @Test
    void activeForDoesNotReturnExpiredSubscription() {
        UUID boxId = newBoxId("active-expired-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus("ACTIVE");
        s.setPriceCents(3000);
        s.setCurrentPeriodEnd(Instant.now().minusSeconds(3600));
        subscriptions.save(s);

        assertThat(subscriptionService.activeFor(membershipId)).isEmpty();
    }

    @Test
    void activeForReturnsSubscriptionEndingInTheFuture() {
        UUID boxId = newBoxId("active-future-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(30);
        UUID membershipId = newMembership(boxId);

        subscriptionService.recordPeriod(membershipId, planId, 3000, null);

        assertThat(subscriptionService.activeFor(membershipId)).isPresent();
    }
}
