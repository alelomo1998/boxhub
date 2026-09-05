package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.notify.Notification;
import com.boxhub.notify.NotificationRepository;
import com.boxhub.notify.NotificationType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SessionController.patch on a cancellation, a time move, or a coach swap. Lives in com.boxhub.box
 * (not com.boxhub.notify) because it drives the controller directly and needs PatchSessionRequest,
 * which is package-private.
 */
class SessionNotificationTest extends AbstractIntegrationTest {

    @Autowired SessionController controller;
    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookingRepo;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired BookingService bookingService;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    // Staff, not the athlete-flavoured actAsBox in BookingNotificationTest: patch requires
    // RoleGuard.requireStaff() (COACH or BOX_ADMIN), copied from SessionApiTest.
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
    }

    private UUID newEntitledMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("snotify-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
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
        b.setName("SessNotify " + n);
        b.setSlug("sess-notify-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);
        return boxId;
    }

    private record RosterSeed(UUID sessionId, UUID bookedMembershipId, UUID waitlistedMembershipId, Instant startAt) {}

    @Test
    void cancellingAClassWithADropInVisitorStillNotifiesTheMembers() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        // A drop-in visitor books with visitor_user_id set and membership_id NULL (M22, V26's
        // ck_booking_subject). notification.membership_id is NOT NULL, so mapping the roster
        // straight to membership ids would abort the whole PATCH the first time a visitor sat in
        // the class — a coach simply could not cancel it. NotificationService.emitAll drops the
        // null centrally, because every booking-derived fan-out has the same hole.
        User visitor = authService.register("visitor-" + System.nanoTime() + "@t.io",
                "correct-horse-battery", "Visitor");
        Booking dropIn = new Booking();
        dropIn.setSessionId(seeded.sessionId());
        dropIn.setVisitorUserId(visitor.getId());
        dropIn.setStatus("BOOKED");
        bookingRepo.save(dropIn);

        patchSession(seeded.sessionId(), cancelRequest());

        // The two members are told; the visitor is simply not addressable in-app.
        assertThat(notifications.findAll()).hasSize(2)
                .allSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.CLASS_CANCELLED.name()))
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrder(seeded.bookedMembershipId(), seeded.waitlistedMembershipId());
    }

    private RosterSeed seedSessionWithBookedAndWaitlisted() {
        UUID boxId = seedBox();
        ClassSession s = new ClassSession();
        s.setName("WOD");
        Instant startAt = Instant.now().plusSeconds(3600 * 24);
        s.setStartAt(startAt);
        s.setDurationMin(60);
        s.setCapacity(1); // 1 slot: second booker lands on the waitlist
        UUID sessionId = sessions.save(s).getId();

        UUID membershipA = newEntitledMembership(boxId);
        UUID membershipB = newEntitledMembership(boxId);
        bookingService.book(sessionId, membershipA); // BOOKED
        bookingService.book(sessionId, membershipB); // WAITLIST

        return new RosterSeed(sessionId, membershipA, membershipB, startAt);
    }

    private record CancelledRosterSeed(UUID sessionId, UUID bookedMembershipId,
                                        UUID waitlistedMembershipId, UUID cancelledMembershipId) {}

    private CancelledRosterSeed seedSessionWithBookedWaitlistedAndCancelled() {
        UUID boxId = seedBox();
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(1);
        UUID sessionId = sessions.save(s).getId();

        UUID membershipA = newEntitledMembership(boxId);
        UUID membershipB = newEntitledMembership(boxId);
        UUID membershipC = newEntitledMembership(boxId);
        bookingService.book(sessionId, membershipA); // BOOKED
        bookingService.book(sessionId, membershipB); // WAITLIST
        bookingService.book(sessionId, membershipC); // WAITLIST (capacity already spoken for)
        bookingService.cancel(sessionId, membershipC); // CANCELLED: off the roster

        return new CancelledRosterSeed(sessionId, membershipA, membershipB, membershipC);
    }

    /** A raw User id to swap the coach to; the seeded session starts with no coach at all. */
    private UUID seedSecondCoachUserId() {
        long n = System.nanoTime();
        User u = authService.register("scoach2-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Coach Two");
        return u.getId();
    }

    private SessionController.PatchSessionRequest cancelRequest() {
        return new SessionController.PatchSessionRequest(null, null, null, "CANCELLED");
    }

    private SessionController.PatchSessionRequest startAtRequest(Instant startAt) {
        return new SessionController.PatchSessionRequest(null, null, startAt, null);
    }

    private SessionController.PatchSessionRequest coachRequest(UUID coachId) {
        return new SessionController.PatchSessionRequest(null, coachId, null, null);
    }

    private SessionController.PatchSessionRequest capacityRequest(int capacity) {
        return new SessionController.PatchSessionRequest(capacity, null, null, null);
    }

    private void patchSession(UUID sessionId, SessionController.PatchSessionRequest req) {
        controller.patch(sessionId, req);
    }

    @Test
    void cancellingAClassTellsTheRosterAndTheWaitlist() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), cancelRequest());

        assertThat(notifications.findAll())
                .hasSize(2)
                .allSatisfy(n -> assertThat(n.getType()).isEqualTo(NotificationType.CLASS_CANCELLED.name()))
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrder(seeded.bookedMembershipId(), seeded.waitlistedMembershipId());
    }

    @Test
    void movingAClassCarriesBothTimes() {
        var seeded = seedSessionWithBookedAndWaitlisted();
        Instant moved = seeded.startAt().plus(90, ChronoUnit.MINUTES);

        patchSession(seeded.sessionId(), startAtRequest(moved));

        assertThat(notifications.findAll()).hasSize(2).allSatisfy(n -> {   // hasSize: allSatisfy passes vacuously on an empty list
            assertThat(n.getType()).isEqualTo(NotificationType.CLASS_TIME_CHANGED.name());
            // Both times: "moved to 07:30" is useless if you cannot tell which class moved.
            assertThat(n.getParams()).containsEntry(NotificationType.OLD_START_AT, seeded.startAt().toString());
            assertThat(n.getParams()).containsEntry(NotificationType.NEW_START_AT, moved.toString());
        });
    }

    @Test
    void patchingStartAtToTheSameInstantNotifiesNobody() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), startAtRequest(seeded.startAt()));

        // A no-op save must not fire. A PATCH that echoes the current value is routine.
        assertThat(notifications.count()).isZero();
    }

    @Test
    void swappingTheCoachTellsTheRoster() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), coachRequest(seedSecondCoachUserId()));

        assertThat(notifications.findAll()).hasSize(2).allSatisfy(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.COACH_CHANGED.name());
            assertThat(n.getParams()).containsKey(NotificationType.COACH_NAME);
        });
    }

    @Test
    void patchingCapacityAloneNotifiesNobody() {
        var seeded = seedSessionWithBookedAndWaitlisted();

        patchSession(seeded.sessionId(), capacityRequest(30));

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aCancelledMemberIsNotNotified() {
        // Someone who already dropped out is not on the roster and must not hear about it.
        var seeded = seedSessionWithBookedWaitlistedAndCancelled();

        patchSession(seeded.sessionId(), cancelRequest());

        // hasSize(2): the roster is A (BOOKED) + B (WAITLIST). Without it doesNotContain would pass
        // vacuously if the fan-out broke entirely, which is the opposite of what this test checks.
        assertThat(notifications.findAll())
                .hasSize(2)
                .extracting(Notification::getMembershipId)
                .doesNotContain(seeded.cancelledMembershipId());
    }
}
