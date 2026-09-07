package com.boxhub.programming;

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
import com.boxhub.notify.Notification;
import com.boxhub.notify.NotificationChannel;
import com.boxhub.notify.NotificationPref;
import com.boxhub.notify.NotificationPrefRepository;
import com.boxhub.notify.NotificationRepository;
import com.boxhub.notify.NotificationType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PROGRAMMING_PUBLISHED — the coach has posted the class's programming (docs/NOTIFICATIONS.md §4.4,
 * amended 2026-09-07).
 *
 * <p>Lives in com.boxhub.programming rather than com.boxhub.notify, following SessionNotificationTest:
 * it drives the controller directly and SessionItemController.ProgrammingRequest is package-private.
 *
 * <p><b>Every read below is tenant-scoped by the staff JWT actAsBox installs</b>, and each test seeds
 * its own box — so an emptiness assertion is about this box's rows, not about a tenant-less read
 * failing closed and returning nothing (M21).
 */
class ProgrammingPublishedTest extends AbstractIntegrationTest {

    @Autowired SessionItemController controller;
    @Autowired NotificationRepository notifications;
    @Autowired NotificationPrefRepository prefs;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookingRepo;
    @Autowired BookingService bookingService;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired PlatformTransactionManager txManager;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    /** Staff: publish() is behind RoleGuard.requireStaff(). */
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
    }

    private UUID seedBox() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Programming " + n);
        b.setSlug("programming-pub-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);
        return boxId;
    }

    private UUID newEntitledMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("progpub-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Athlete");
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

    private record Seed(UUID boxId, UUID sessionId, List<UUID> bookedMembershipIds) {}

    private Seed seedSessionWithBookings(int howMany) {
        UUID boxId = seedBox();
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600 * 24));
        s.setDurationMin(60);
        s.setCapacity(howMany + 5);
        UUID sessionId = sessions.save(s).getId();

        List<UUID> booked = new ArrayList<>();
        for (int i = 0; i < howMany; i++) {
            UUID membershipId = newEntitledMembership(boxId);
            bookingService.book(sessionId, membershipId);
            booked.add(membershipId);
        }
        return new Seed(boxId, sessionId, booked);
    }

    private void setProgramming(UUID sessionId, String status) {
        controller.publish(sessionId, new SessionItemController.ProgrammingRequest(status));
    }

    private void publishProgramming(UUID sessionId) {
        setProgramming(sessionId, "PUBLISHED");
    }

    private void publishProgrammingAndForceRollback(UUID sessionId) {
        try {
            new TransactionTemplate(txManager).executeWithoutResult(status -> {
                controller.publish(sessionId, new SessionItemController.ProgrammingRequest("PUBLISHED"));
                throw new IllegalStateException("boom — the publish failed after emitting");
            });
        } catch (IllegalStateException expected) {
            // the workout was never posted, so the roster must not have been told it was
        }
    }

    /** A drop-in visitor books with membership_id NULL (M22, V26's ck_booking_subject). */
    private void addVisitorBooking(UUID sessionId) {
        User visitor = authService.register("progpub-visitor-" + System.nanoTime() + "@t.io",
                "correct-horse-battery", "Visitor");
        Booking dropIn = new Booking();
        dropIn.setSessionId(sessionId);
        dropIn.setVisitorUserId(visitor.getId());
        dropIn.setStatus("BOOKED");
        bookingRepo.save(dropIn);
    }

    private void disablePref(UUID membershipId, NotificationType type) {
        NotificationPref off = new NotificationPref();
        off.setMembershipId(membershipId);
        off.setType(type.name());
        off.setChannel(NotificationChannel.IN_APP.name());
        off.setEnabled(false);
        prefs.save(off);
    }

    private List<Notification> notificationsOfType(NotificationType type) {
        return notifications.findAll().stream().filter(n -> type.name().equals(n.getType())).toList();
    }

    private String programmingStatusOf(UUID sessionId) {
        return sessions.findById(sessionId).orElseThrow().getProgrammingStatus();
    }

    @Test
    void publishingNotifiesEveryBookedAthlete() {
        var s = seedSessionWithBookings(3);

        publishProgramming(s.sessionId());

        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED))
                .hasSize(3)
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(s.bookedMembershipIds());
    }

    @Test
    void theLinkPointsAtThatClass() {
        var s = seedSessionWithBookings(1);

        publishProgramming(s.sessionId());

        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED)).singleElement()
                .satisfies(n -> {
                    assertThat(n.getLink()).isEqualTo("/athlete/class/" + s.sessionId());
                    assertThat(n.getParams()).containsEntry(NotificationType.CLASS_NAME, "WOD");
                });
    }

    /**
     * A coach fixing a typo and hitting Save and republish must not re-notify the roster. Two
     * separate guards, so both paths run here: publishing an already-PUBLISHED session is not a
     * transition at all, and a DRAFT round trip IS one but is caught by the sessionId dedupe key.
     */
    @Test
    void republishingDoesNotNotifyAgain() {
        var s = seedSessionWithBookings(2);

        publishProgramming(s.sessionId());
        publishProgramming(s.sessionId());          // not a transition
        setProgramming(s.sessionId(), "DRAFT");
        publishProgramming(s.sessionId());          // a transition, stopped by the dedupe key

        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED)).hasSize(2);
    }

    @Test
    void goingBackToDraftNotifiesNobody() {
        var s = seedSessionWithBookings(2);

        setProgramming(s.sessionId(), "DRAFT");

        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED)).isEmpty();
    }

    /**
     * A drop-in visitor books with membership_id NULL (M22) and notification.membership_id is NOT
     * NULL. emitAll filters nulls centrally; this asserts the roster fan-out actually survives one
     * rather than aborting the coach's whole publish transaction.
     */
    @Test
    void aVisitorBookingDoesNotBreakThePublish() {
        var s = seedSessionWithBookings(2);
        addVisitorBooking(s.sessionId());

        publishProgramming(s.sessionId());

        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED))
                .hasSize(2)
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(s.bookedMembershipIds());
    }

    @Test
    void someoneWhoTurnedItOffGetsNothing() {
        var s = seedSessionWithBookings(2);
        disablePref(s.bookedMembershipIds().get(0), NotificationType.PROGRAMMING_PUBLISHED);

        publishProgramming(s.sessionId());

        // Opt-out, not mandatory: a training event has a switch and it must work.
        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED)).singleElement()
                .extracting(Notification::getMembershipId)
                .isEqualTo(s.bookedMembershipIds().get(1));
    }

    /**
     * An in-app row is PERSISTENCE and belongs INSIDE the transaction that caused it (registry
     * §5.1): a rolled-back publish must erase its own notification.
     */
    @Test
    void aRolledBackPublishLeavesNoNotification() {
        var s = seedSessionWithBookings(2);

        publishProgrammingAndForceRollback(s.sessionId());

        assertThat(notificationsOfType(NotificationType.PROGRAMMING_PUBLISHED)).isEmpty();
        assertThat(programmingStatusOf(s.sessionId())).isEqualTo("DRAFT");
    }
}
