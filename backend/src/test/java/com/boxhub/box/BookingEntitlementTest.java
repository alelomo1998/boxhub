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

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * M10 T4: booking rights follow the active subscription, not Membership.planId (dropped in T1).
 * Drives BookingService the same way BookingEngineTest does (direct service calls under an
 * actAsBox tenant context) so subscription/plan fixtures can be wired precisely per case.
 */
class BookingEntitlementTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired BookingService bookingService;
    @Autowired BookingRepository bookings;
    @Autowired SubscriptionLapseJob lapseJob;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Entitlement " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("ent-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private UUID newSession(Instant startAt) {
        return newSession(startAt, 5);
    }

    private UUID newSession(Instant startAt, int capacity) {
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(startAt);
        s.setDurationMin(60);
        s.setCapacity(capacity);
        return sessions.save(s).getId();
    }

    private UUID newPlan(String entitlement, Integer weeklyLimit) {
        Plan p = new Plan();
        p.setName("Plan " + entitlement);
        p.setDurationDays(30);
        p.setEntitlement(entitlement);
        p.setWeeklyClassLimit(weeklyLimit);
        return plans.save(p).getId();
    }

    /** Directly persists a subscription row so grandfathered (null end) / expired fixtures are exact. */
    private void saveSubscription(UUID membershipId, UUID planId, Instant currentPeriodEnd) {
        Subscription s = new Subscription();
        s.setMembershipId(membershipId);
        s.setPlanId(planId);
        s.setStatus("ACTIVE");
        s.setPriceCents(0);
        s.setCurrentPeriodEnd(currentPeriodEnd);
        subscriptions.save(s);
    }

    @Test
    void noActiveSubscriptionCannotBook() {
        UUID boxId = newBox("no-sub-" + System.nanoTime());
        actAsBox(boxId);
        UUID m1 = newMembership(boxId);
        UUID sessionId = newSession(Instant.now().plusSeconds(3600 * 24));

        assertThatThrownBy(() -> bookingService.book(sessionId, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("NO_ACTIVE_SUBSCRIPTION");
                });
    }

    @Test
    void unlimitedActiveSubscriptionBooksFine() {
        UUID boxId = newBox("unlimited-" + System.nanoTime());
        actAsBox(boxId);
        UUID m1 = newMembership(boxId);
        UUID planId = newPlan("UNLIMITED", null);
        subscriptionService.recordPeriod(m1, planId, 0, "test");

        UUID sessionId = newSession(Instant.now().plusSeconds(3600 * 24));
        Booking b = bookingService.book(sessionId, m1);
        assertThat(b.getStatus()).isEqualTo("BOOKED");
    }

    @Test
    void weeklyLimitUnderCapBooksFineAtCapIsBlocked() {
        UUID boxId = newBox("weekly-" + System.nanoTime());
        actAsBox(boxId);
        UUID m1 = newMembership(boxId);
        UUID planId = newPlan("WEEKLY_LIMIT", 1);
        subscriptionService.recordPeriod(m1, planId, 0, "test");

        Instant weekAnchor = Instant.now().plusSeconds(3600 * 24);
        UUID sessionA = newSession(weekAnchor);
        UUID sessionB = newSession(weekAnchor.plusSeconds(3600));

        Booking booked = bookingService.book(sessionA, m1);
        assertThat(booked.getStatus()).isEqualTo("BOOKED");

        assertThatThrownBy(() -> bookingService.book(sessionB, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("LIMIT_REACHED");
                });
    }

    @Test
    void grandfatheredNullEndBooksFine() {
        UUID boxId = newBox("grandfather-" + System.nanoTime());
        actAsBox(boxId);
        UUID m1 = newMembership(boxId);
        UUID planId = newPlan("UNLIMITED", null);
        saveSubscription(m1, planId, null); // ACTIVE, null currentPeriodEnd == grandfathered, never expires

        UUID sessionId = newSession(Instant.now().plusSeconds(3600 * 24));
        Booking b = bookingService.book(sessionId, m1);
        assertThat(b.getStatus()).isEqualTo("BOOKED");
    }

    @Test
    void expiredSubscriptionCannotBookNewClasses() {
        UUID boxId = newBox("expired-" + System.nanoTime());
        actAsBox(boxId);
        UUID m1 = newMembership(boxId);
        UUID planId = newPlan("UNLIMITED", null);
        saveSubscription(m1, planId, Instant.now().minusSeconds(3600)); // ACTIVE row, but period already ended

        UUID sessionId = newSession(Instant.now().plusSeconds(3600 * 24));
        assertThatThrownBy(() -> bookingService.book(sessionId, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("NO_ACTIVE_SUBSCRIPTION");
                });
    }

    /**
     * M10's headline promise, other half: entitlementBlocked() only gates book() — cancel/checkIn
     * are untouched — so a lapse must never disturb a booking made while the member was still
     * entitled. Books two classes, lapses the subscription via the SAME nightly sweep the lapse
     * email is driven by, then proves both existing bookings survive every subsequent state
     * transition while a brand-new book() is the only thing that gets blocked.
     */
    @Test
    void lapseDoesNotDisturbExistingBookingsOnlyBlocksNewOnes() {
        UUID boxId = newBox("lapse-survives-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan("UNLIMITED", null);
        UUID m1 = newMembership(boxId);
        subscriptionService.recordPeriod(m1, planId, 0, "test");

        UUID checkinSession = newSession(Instant.now().plusSeconds(3600 * 24));
        UUID cancelSession = newSession(Instant.now().plusSeconds(3600 * 24 * 2));
        UUID freshSession = newSession(Instant.now().plusSeconds(3600 * 24 * 3));

        Booking checkinBooking = bookingService.book(checkinSession, m1);
        Booking cancelBooking = bookingService.book(cancelSession, m1);
        assertThat(checkinBooking.getStatus()).isEqualTo("BOOKED");
        assertThat(cancelBooking.getStatus()).isEqualTo("BOOKED");

        // Flip the subscription's end into the past, then run the exact sweep the lapse job runs
        // nightly — not a hand-rolled EXPIRED row — so this pins the real flow end to end.
        Subscription sub = subscriptions.findByMembershipIdAndStatus(m1, "ACTIVE").orElseThrow();
        sub.setCurrentPeriodEnd(Instant.now().minusSeconds(3600));
        subscriptions.save(sub);
        lapseJob.sweepBox(boxId);
        actAsBox(boxId); // sweepBox restores whatever auth was active before it ran; re-establish anyway
        assertThat(subscriptions.findById(sub.getId()).orElseThrow().getStatus()).isEqualTo("EXPIRED");

        // both existing bookings are untouched by the lapse
        assertThat(bookings.findBySessionIdAndMembershipIdAndStatusNot(checkinSession, m1, "CANCELLED")).isPresent();
        assertThat(bookings.findBySessionIdAndMembershipIdAndStatusNot(cancelSession, m1, "CANCELLED")).isPresent();

        Booking checkedIn = bookingService.checkIn(checkinBooking.getId());
        assertThat(checkedIn.getStatus()).isEqualTo("CHECKED_IN");

        bookingService.cancel(cancelSession, m1); // no throw == still succeeds
        // cancellation is a fact now, not a deletion (M14a): the row survives with status CANCELLED.
        Booking cancelledRow = bookings.findById(cancelBooking.getId()).orElseThrow();
        assertThat(cancelledRow.getStatus()).isEqualTo("CANCELLED");

        assertThatThrownBy(() -> bookingService.book(freshSession, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("NO_ACTIVE_SUBSCRIPTION");
                });
    }

    /** BookingService.cancel's waitlist promotion (lines ~82-93) never checks entitlement — a
     *  member who lapsed WHILE waitlisted must still be promoted the moment a slot frees up. */
    @Test
    void waitlistPromotionStillPromotesAMemberWhoLapsedWhileWaitlisted() {
        UUID boxId = newBox("wl-lapse-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan("UNLIMITED", null);
        UUID m1 = newMembership(boxId);
        UUID m2 = newMembership(boxId);
        subscriptionService.recordPeriod(m1, planId, 0, "test");
        subscriptionService.recordPeriod(m2, planId, 0, "test");

        UUID sessionId = newSession(Instant.now().plusSeconds(3600 * 24), 1); // capacity 1 forces a waitlist
        Booking b1 = bookingService.book(sessionId, m1);
        assertThat(b1.getStatus()).isEqualTo("BOOKED");
        Booking b2 = bookingService.book(sessionId, m2);
        assertThat(b2.getStatus()).isEqualTo("WAITLIST");

        Subscription sub2 = subscriptions.findByMembershipIdAndStatus(m2, "ACTIVE").orElseThrow();
        sub2.setCurrentPeriodEnd(Instant.now().minusSeconds(3600));
        subscriptions.save(sub2);
        lapseJob.sweepBox(boxId);
        actAsBox(boxId);
        assertThat(subscriptions.findById(sub2.getId()).orElseThrow().getStatus()).isEqualTo("EXPIRED");

        bookingService.cancel(sessionId, m1); // frees the one slot

        Booking promoted = bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, m2, "CANCELLED").orElseThrow();
        assertThat(promoted.getStatus()).isEqualTo("BOOKED"); // promoted despite the lapse
    }
}
