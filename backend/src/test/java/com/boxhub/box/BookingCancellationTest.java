package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BookingCancellationTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired BookingService bookings;
    @Autowired BookingRepository bookingRepo;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private record Ctx(UUID boxId, UUID sessionId, UUID membershipId) {}

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newEntitledMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("cancel-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        Plan p = new Plan();
        p.setName("Plan " + n);
        p.setDurationDays(30);
        p.setEntitlement("UNLIMITED");
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");
        return membershipId;
    }

    // Builds a box + a bookable session (far enough out that cutoff never blocks) + an entitled
    // membership (UNLIMITED plan/subscription), the same shape BookingEngineTest/BookingEntitlementTest use.
    private Ctx seedBookableSession() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Cancel " + n);
        b.setSlug("cancel-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);

        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(5);
        UUID sessionId = sessions.save(s).getId();

        UUID membershipId = newEntitledMembership(boxId);
        return new Ctx(boxId, sessionId, membershipId);
    }

    private void setBoxCancelCutoffMinutes(UUID boxId, int minutes) {
        Box box = boxes.findById(boxId).orElseThrow();
        box.setCancelCutoffMin(minutes);
        boxes.save(box);
    }

    @Test
    void cancellingKeepsTheRowAndStampsWhen() {
        var ctx = seedBookableSession();
        var booking = bookings.book(ctx.sessionId(), ctx.membershipId());

        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        var row = bookingRepo.findById(booking.getId()).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("CANCELLED");
        assertThat(row.getCancelledAt()).isNotNull();
        assertThat(row.getWasLate()).isNotNull();
    }

    @Test
    void aCancelledBookingDoesNotBlockReBooking() {
        var ctx = seedBookableSession();
        bookings.book(ctx.sessionId(), ctx.membershipId());
        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        var again = bookings.book(ctx.sessionId(), ctx.membershipId());

        assertThat(again.getStatus()).isEqualTo("BOOKED");
        assertThat(bookingRepo.findAll().stream()
                .filter(b -> b.getMembershipId().equals(ctx.membershipId())).count()).isEqualTo(2);
    }

    // Spec §7's other half: the partial index must still forbid two SIMULTANEOUS active bookings for
    // the same (session, membership). Can't be proved through BookingService.book — its ALREADY_BOOKED
    // guard rejects a second active booking before the database is ever asked, so this stays green even
    // if uq_active_booking were dropped and never recreated. Bypasses the service and inserts directly.
    @Test
    void thePartialIndexStillForbidsTwoSimultaneousActiveBookings() {
        var ctx = seedBookableSession();
        bookings.book(ctx.sessionId(), ctx.membershipId()); // one active (BOOKED) row now exists

        Booking secondActive = new Booking();
        secondActive.setSessionId(ctx.sessionId());
        secondActive.setMembershipId(ctx.membershipId());
        secondActive.setStatus("WAITLIST"); // any non-CANCELLED status collides on the partial index
        assertThatThrownBy(() -> { bookingRepo.save(secondActive); bookingRepo.flush(); })
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void thePartialIndexPermitsASecondRowOnceTheFirstIsCancelled() {
        var ctx = seedBookableSession();
        bookings.book(ctx.sessionId(), ctx.membershipId());
        bookings.cancel(ctx.sessionId(), ctx.membershipId()); // the only row is now CANCELLED

        Booking secondActive = new Booking();
        secondActive.setSessionId(ctx.sessionId());
        secondActive.setMembershipId(ctx.membershipId());
        secondActive.setStatus("BOOKED");
        assertThatCode(() -> { bookingRepo.save(secondActive); bookingRepo.flush(); })
                .doesNotThrowAnyException();
    }

    @Test
    void wasLateIsStampedFromTheCutoffInForceAtCancelTime() {
        // change cancel_cutoff_min AFTER cancelling; the stored verdict must not move
        var ctx = seedBookableSession();
        bookings.book(ctx.sessionId(), ctx.membershipId());
        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        var before = bookingRepo.findAll().stream()
                .filter(b -> b.getCancelledAt() != null).findFirst().orElseThrow().getWasLate();

        setBoxCancelCutoffMinutes(ctx.boxId(), 10_000);   // make everything "late" going forward

        var after = bookingRepo.findAll().stream()
                .filter(b -> b.getCancelledAt() != null).findFirst().orElseThrow().getWasLate();
        assertThat(after).isEqualTo(before);
    }

    @Test
    void onTimeCancelIsStampedFalse() {
        var ctx = seedBookableSession(); // session 24h out, cutoff 120min -> comfortably outside
        var booking = bookings.book(ctx.sessionId(), ctx.membershipId());

        bookings.cancel(ctx.sessionId(), ctx.membershipId());

        assertThat(bookingRepo.findById(booking.getId()).orElseThrow().getWasLate()).isFalse();
    }

    @Test
    void lateCancelIsStampedTrue() {
        // The PAST_CUTOFF guard only blocks cancelling a BOOKED booking, so a late cancel that must
        // still succeed (and reach the wasLate computation) needs a status the guard doesn't gate —
        // a WAITLIST booking on a session starting inside the cutoff window.
        var ctx = seedBookableSession();
        ClassSession s = sessions.findById(ctx.sessionId()).orElseThrow();
        s.setCapacity(1);
        s.setStartAt(Instant.now().plusSeconds(600)); // 10 min out, inside the 120-min cutoff
        sessions.save(s);

        bookings.book(ctx.sessionId(), ctx.membershipId()); // fills the one spot -> BOOKED
        UUID waitlistedMembershipId = newEntitledMembership(ctx.boxId());
        var waitlisted = bookings.book(ctx.sessionId(), waitlistedMembershipId);
        assertThat(waitlisted.getStatus()).isEqualTo("WAITLIST");

        bookings.cancel(ctx.sessionId(), waitlistedMembershipId); // WAITLIST cancel bypasses PAST_CUTOFF

        assertThat(bookingRepo.findById(waitlisted.getId()).orElseThrow().getWasLate()).isTrue();
    }
}
