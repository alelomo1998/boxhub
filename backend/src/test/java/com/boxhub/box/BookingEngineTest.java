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

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.NoSuchElementException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BookingEngineTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired BookingService bookingService;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private UUID newBox(String slug, int cutoffMin) {
        Box b = new Box();
        b.setName("Booking " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(cutoffMin);
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

    // M10 T4: booking now requires an active Subscription (Membership.planId is gone). A null
    // planId here means "this test doesn't care about entitlement" -> give it a default
    // UNLIMITED plan/subscription so booking is unblocked, same as before the gate existed.
    private UUID newMembership(UUID boxId, UUID planId) {
        long n = System.nanoTime();
        User u = authService.register("bk-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();
        UUID effectivePlanId = planId != null ? planId : newPlan(null);
        subscriptionService.recordPeriod(membershipId, effectivePlanId, 0, "test");
        return membershipId;
    }

    private UUID newSession(int capacity, Instant startAt) {
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(startAt);
        s.setDurationMin(60);
        s.setCapacity(capacity);
        return sessions.save(s).getId();
    }

    private UUID newPlan(Integer weeklyLimit) {
        Plan p = new Plan();
        p.setName("Plan " + System.nanoTime() + "-" + Math.random());
        p.setDurationDays(30);
        p.setEntriesPerWeek(weeklyLimit);
        return plans.save(p).getId();
    }

    @Test
    void fillsToCapacityThenWaitlists() {
        UUID boxId = newBox("fill-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID sessionId = newSession(2, Instant.now().plusSeconds(3600 * 24));
        UUID m1 = newMembership(boxId, null);
        UUID m2 = newMembership(boxId, null);
        UUID m3 = newMembership(boxId, null);
        UUID m4 = newMembership(boxId, null);

        assertThat(bookingService.book(sessionId, m1).getStatus()).isEqualTo("BOOKED");
        assertThat(bookingService.book(sessionId, m2).getStatus()).isEqualTo("BOOKED");

        Booking w1 = bookingService.book(sessionId, m3);
        assertThat(w1.getStatus()).isEqualTo("WAITLIST");
        assertThat(w1.getPosition()).isEqualTo(1);

        Booking w2 = bookingService.book(sessionId, m4);
        assertThat(w2.getStatus()).isEqualTo("WAITLIST");
        assertThat(w2.getPosition()).isEqualTo(2);
    }

    @Test
    void cancelBookedPromotesWaitlistAndRenumbers() {
        UUID boxId = newBox("promote-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID sessionId = newSession(1, Instant.now().plusSeconds(3600 * 24));
        UUID m1 = newMembership(boxId, null);
        UUID m2 = newMembership(boxId, null);
        UUID m3 = newMembership(boxId, null);

        bookingService.book(sessionId, m1); // BOOKED
        bookingService.book(sessionId, m2); // WAITLIST 1
        bookingService.book(sessionId, m3); // WAITLIST 2

        bookingService.cancel(sessionId, m1);

        Booking b2 = bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, m2, "CANCELLED").orElseThrow();
        assertThat(b2.getStatus()).isEqualTo("BOOKED");
        assertThat(b2.getPosition()).isNull();

        Booking b3 = bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, m3, "CANCELLED").orElseThrow();
        assertThat(b3.getStatus()).isEqualTo("WAITLIST");
        assertThat(b3.getPosition()).isEqualTo(1);
    }

    @Test
    void cutoffBlocksLateCancelButNotBooking() {
        UUID boxId = newBox("cutoff-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID soonSession = newSession(5, Instant.now().plusSeconds(30 * 60));
        UUID m1 = newMembership(boxId, null);

        Booking b = bookingService.book(soonSession, m1);
        assertThat(b.getStatus()).isEqualTo("BOOKED");

        assertThatThrownBy(() -> bookingService.cancel(soonSession, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("PAST_CUTOFF");
                });

        UUID farSession = newSession(5, Instant.now().plusSeconds(3600L * 24 * 5));
        UUID m2 = newMembership(boxId, null);
        bookingService.book(farSession, m2);
        bookingService.cancel(farSession, m2); // outside cutoff -> ok, no exception
        assertThat(bookings.findBySessionIdAndMembershipIdAndStatusNot(farSession, m2, "CANCELLED")).isEmpty();
    }

    @Test
    void weeklyLimitBlocksAtBoundaryAndAWaitlistJoinCountsTowardIt() {
        UUID boxId = newBox("limit-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID planId = newPlan(2);
        UUID m1 = newMembership(boxId, planId);
        UUID other = newMembership(boxId, null);

        Instant weekAnchor = nextMondayAtTen(); // pinned: all three sessions provably in one week
        UUID fullSession = newSession(1, weekAnchor);
        UUID sessionB = newSession(5, weekAnchor.plusSeconds(3600));
        UUID sessionC = newSession(5, weekAnchor.plusSeconds(7200));

        // Fill fullSession with someone else, then m1 waitlists. M16a REVERSED the old rule here: a
        // waitlist join now consumes an entry (user decision, 2026-08-22). Before M16a the count came
        // from `bookings` filtered to BOOKED/CHECKED_IN, so a waitlisted athlete was free — which let
        // someone already at their limit queue for every class in the week and be promoted past it.
        // Charging at join is exactly what makes promotion safe: promotion writes no ledger row, so it
        // can never push anyone over a limit.
        bookingService.book(fullSession, other);
        Booking waitlisted = bookingService.book(fullSession, m1);
        assertThat(waitlisted.getStatus()).isEqualTo("WAITLIST");

        // limit is 2, and the waitlist join already spent one: this BOOKED lands exactly on the boundary
        Booking booked = bookingService.book(sessionB, m1);
        assertThat(booked.getStatus()).isEqualTo("BOOKED");

        // third entry in the same week hits the limit
        assertThatThrownBy(() -> bookingService.book(sessionC, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("ENTRIES_PER_WEEK");
                });
    }

    /** A Monday 10:00 Europe/Rome, 8-14 days out. Pinned to a weekday rather than now()+24h so a
     *  "same week" fixture cannot straddle a Monday boundary on some days of the week and not others. */
    private static Instant nextMondayAtTen() {
        ZoneId tz = ZoneId.of("Europe/Rome");
        return LocalDate.now(tz).with(TemporalAdjusters.next(DayOfWeek.MONDAY)).plusWeeks(1)
                .atStartOfDay(tz).plusHours(10).toInstant();
    }

    @Test
    void nullPlanLimitIsUnlimited() {
        UUID boxId = newBox("unlimited-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID planId = newPlan(null);
        UUID m1 = newMembership(boxId, planId);

        Instant weekAnchor = Instant.now().plusSeconds(3600 * 24);
        for (int i = 0; i < 3; i++) {
            UUID s = newSession(5, weekAnchor.plusSeconds(3600L * i));
            assertThat(bookingService.book(s, m1).getStatus()).isEqualTo("BOOKED");
        }
    }

    @Test
    void alreadyBookedIsConflict() {
        UUID boxId = newBox("dup-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID sessionId = newSession(5, Instant.now().plusSeconds(3600 * 24));
        UUID m1 = newMembership(boxId, null);

        bookingService.book(sessionId, m1);
        assertThatThrownBy(() -> bookingService.book(sessionId, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("ALREADY_BOOKED");
                });
    }

    @Test
    void cancelledSessionRejectsBooking() {
        UUID boxId = newBox("cancelled-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID sessionId = newSession(5, Instant.now().plusSeconds(3600 * 24));
        ClassSession s = sessions.findById(sessionId).orElseThrow();
        s.setStatus("CANCELLED");
        sessions.save(s);
        UUID m1 = newMembership(boxId, null);

        assertThatThrownBy(() -> bookingService.book(sessionId, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("CANCELLED");
                });
    }

    @Test
    void pastSessionRejectsBooking() {
        UUID boxId = newBox("past-" + System.nanoTime(), 120);
        actAsBox(boxId);
        UUID sessionId = newSession(5, Instant.now().minusSeconds(3600));
        UUID m1 = newMembership(boxId, null);

        assertThatThrownBy(() -> bookingService.book(sessionId, m1))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> {
                    assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(ex.getReason()).isEqualTo("PAST");
                });
    }

    @Test
    void crossTenantSessionIsInvisible() {
        UUID boxA = newBox("xa-" + System.nanoTime(), 120);
        UUID boxB = newBox("xb-" + System.nanoTime(), 120);

        actAsBox(boxB);
        UUID foreignSessionId = newSession(5, Instant.now().plusSeconds(3600 * 24));

        actAsBox(boxA);
        UUID m1 = newMembership(boxA, null);

        assertThatThrownBy(() -> bookingService.book(foreignSessionId, m1))
                .isInstanceOf(NoSuchElementException.class);
    }
}
