package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.BookingService;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.box.Plan;
import com.boxhub.box.PlanRepository;
import com.boxhub.box.SubscriptionService;
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

class BookingNotificationTest extends AbstractIntegrationTest {

    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired BookingService bookingService;
    @Autowired BookingRepository bookingRepo;

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

    private UUID newEntitledMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("notify-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        Plan p = new Plan();
        p.setName("Plan " + n);
        p.setDurationDays(30);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");
        return membershipId;
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

    private record WaitlistSeed(UUID sessionId, UUID bookedBookingId, UUID waitlistedMembershipId,
                                 String className) {}

    private WaitlistSeed seedFullSessionWithWaitlist() {
        UUID boxId = seedBox();
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(1);
        UUID sessionId = sessions.save(s).getId();

        UUID membershipA = newEntitledMembership(boxId);
        UUID membershipB = newEntitledMembership(boxId);
        Booking booked = bookingService.book(sessionId, membershipA);
        bookingService.book(sessionId, membershipB); // WAITLIST

        return new WaitlistSeed(sessionId, booked.getId(), membershipB, s.getName());
    }

    private record NoWaitlistSeed(UUID sessionId, UUID bookedBookingId, UUID membershipId) {}

    private NoWaitlistSeed seedBookedSessionWithNoWaitlist() {
        UUID boxId = seedBox();
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(5);
        UUID sessionId = sessions.save(s).getId();

        UUID membershipId = newEntitledMembership(boxId);
        Booking booked = bookingService.book(sessionId, membershipId);

        return new NoWaitlistSeed(sessionId, booked.getId(), membershipId);
    }

    private record LateCancelSeed(UUID sessionId, UUID membershipId, UUID bookingId) {}

    private LateCancelSeed seedLateCancelBooking(boolean refundsEntry) {
        UUID boxId = seedBox();
        Box box = boxes.findById(boxId).orElseThrow();
        box.setAllowLateCancel(true);
        box.setCancelCutoffMin(120);
        box.setLateCancelRefundsEntry(refundsEntry);
        boxes.save(box);

        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(1800)); // 30 min out -> inside the 120-min cutoff
        s.setDurationMin(60);
        s.setCapacity(5);
        UUID sessionId = sessions.save(s).getId();

        UUID membershipId = newEntitledMembership(boxId);
        Booking booked = bookingService.book(sessionId, membershipId);

        return new LateCancelSeed(sessionId, membershipId, booked.getId());
    }

    private LateCancelSeed seedBookingCancellableLateWithoutRefund() {
        return seedLateCancelBooking(false);
    }

    private LateCancelSeed seedBookingCancellableLateWithRefund() {
        return seedLateCancelBooking(true);
    }

    @Test
    void promotingOffTheWaitlistTellsThePromotedAthlete() {
        var seeded = seedFullSessionWithWaitlist();
        Booking booked = bookingRepo.findById(seeded.bookedBookingId()).orElseThrow();

        bookingService.cancel(booked.getSessionId(), booked.getMembershipId());

        var rows = notifications.findAll().stream()
                .filter(n -> NotificationType.WAITLIST_PROMOTED.name().equals(n.getType())).toList();
        assertThat(rows).singleElement()
                .satisfies(n -> {
                    assertThat(n.getMembershipId()).isEqualTo(seeded.waitlistedMembershipId());
                    assertThat(n.getParams()).containsEntry(NotificationType.CLASS_NAME, seeded.className());
                    assertThat(n.getLink()).isEqualTo("/athlete/class/" + seeded.sessionId());
                });
    }

    @Test
    void theCancellingMemberIsNotToldAboutTheirOwnCancellation() {
        var seeded = seedFullSessionWithWaitlist();
        Booking booked = bookingRepo.findById(seeded.bookedBookingId()).orElseThrow();

        bookingService.cancel(booked.getSessionId(), booked.getMembershipId());

        // No booking-confirmation-style receipts (D-13): only the promoted athlete hears anything.
        assertThat(notifications.findAll())
                .isNotEmpty()   // allSatisfy passes vacuously on an empty list
                .allSatisfy(n -> assertThat(n.getMembershipId()).isEqualTo(seeded.waitlistedMembershipId()));
    }

    @Test
    void anEmptyWaitlistNotifiesNobody() {
        var seeded = seedBookedSessionWithNoWaitlist();

        bookingService.cancel(seeded.sessionId(), seeded.membershipId());

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aLateCancelThatBurnedTheEntryTellsTheMember() {
        // Box configured so a late cancel does NOT refund the entry.
        var seeded = seedBookingCancellableLateWithoutRefund();

        bookingService.cancel(seeded.sessionId(), seeded.membershipId());

        assertThat(notifications.findAll()).singleElement()
                .satisfies(n -> {
                    assertThat(n.getType()).isEqualTo(NotificationType.LATE_CANCEL_UNREFUNDED.name());
                    assertThat(n.getMembershipId()).isEqualTo(seeded.membershipId());
                });
    }

    @Test
    void aLateCancelThatRefundedTheEntrySaysNothing() {
        // Same lateness, box refunds late cancellations: there is no consequence to report, so
        // this must stay silent rather than become a receipt for an action the member just took.
        var seeded = seedBookingCancellableLateWithRefund();

        bookingService.cancel(seeded.sessionId(), seeded.membershipId());

        assertThat(notifications.findAll())
                .noneSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.LATE_CANCEL_UNREFUNDED.name()));
    }

    @Test
    void markingSomeoneNoShowTwiceTellsThemOnce() {
        var seeded = seedBookedSessionWithNoWaitlist();

        bookingService.markNoShow(seeded.bookedBookingId());
        bookingService.markNoShow(seeded.bookedBookingId());

        // Both /no-show and /uncheck are live coach endpoints, so mark -> uncheck -> mark is a real
        // flow and a double-tap is a likelier one. Two identical rows for one no-show is exactly the
        // "notify more than once" failure D-13 exists to prevent.
        assertThat(notifications.findAll()).singleElement()
                .extracting(Notification::getType).isEqualTo(NotificationType.NO_SHOW_RECORDED.name());
    }

    @Test
    void markingSomeoneNoShowTellsThem() {
        var seeded = seedBookedSessionWithNoWaitlist();

        bookingService.markNoShow(seeded.bookedBookingId());

        assertThat(notifications.findAll()).singleElement()
                .extracting(Notification::getType).isEqualTo(NotificationType.NO_SHOW_RECORDED.name());
    }
}
