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
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real Testcontainers Postgres (from AbstractIntegrationTest) so the session row's
 * SELECT ... FOR UPDATE actually serializes concurrent transactions.
 */
class BookingConcurrencyTest extends AbstractIntegrationTest {

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

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    // M10 T4: booking requires an active Subscription; give each test membership an UNLIMITED
    // one so the entitlement gate never interferes with the no-oversell race this test proves.
    private UUID newMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("conc-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();
        Plan p = new Plan();
        p.setName("Plan " + n + "-" + Math.random());
        p.setDurationDays(30);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");
        return membershipId;
    }

    @Test
    void twoThreadsBookingLastSpotNeverOversell() throws Exception {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Conc " + n);
        box.setSlug("conc-" + n);
        box.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(box).getId();

        actAsBox(boxId);
        ClassSession s = new ClassSession();
        s.setName("Last spot");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(1);
        UUID sessionId = sessions.save(s).getId();
        UUID m1 = newMembership(boxId);
        UUID m2 = newMembership(boxId);
        SecurityContextHolder.clearContext();

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                    pool.submit(() -> raceBook(boxId, sessionId, m1, ready, go)),
                    pool.submit(() -> raceBook(boxId, sessionId, m2, ready, go)));
            ready.await(5, TimeUnit.SECONDS);
            go.countDown();
            for (var f : futures) f.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdown();
        }

        actAsBox(boxId);
        long bookedCount = bookings.countBySessionIdAndStatus(sessionId, "BOOKED");
        long waitlistCount = bookings.countBySessionIdAndStatus(sessionId, "WAITLIST");
        SecurityContextHolder.clearContext();

        assertThat(bookedCount).isEqualTo(1); // no oversell
        assertThat(waitlistCount).isEqualTo(1);
    }

    /** A check-in must not free the place: before the fix capacity counted BOOKED only, so the
     *  first check-in on a full class let the next athlete book past capacity. */
    @Test
    void checkedInAthleteStillHoldsTheirPlace() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Held " + n);
        box.setSlug("held-" + n);
        box.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(box).getId();

        actAsBox(boxId);
        ClassSession s = new ClassSession();
        s.setName("One spot");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(1);
        UUID sessionId = sessions.save(s).getId();
        UUID m1 = newMembership(boxId);
        UUID m2 = newMembership(boxId);

        bookingService.checkIn(bookingService.book(sessionId, m1).getId());
        Booking second = bookingService.book(sessionId, m2);
        SecurityContextHolder.clearContext();

        assertThat(second.getStatus()).isEqualTo("WAITLIST");
    }

    private void raceBook(UUID boxId, UUID sessionId, UUID membershipId, CountDownLatch ready, CountDownLatch go) {
        try {
            actAsBox(boxId);
            ready.countDown();
            go.await(5, TimeUnit.SECONDS);
            bookingService.book(sessionId, membershipId);
        } catch (Exception e) {
            // engine-level conflicts (e.g. already-booked) are not expected here; surface anything unusual
            throw new RuntimeException(e);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
