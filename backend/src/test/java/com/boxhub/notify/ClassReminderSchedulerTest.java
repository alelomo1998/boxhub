package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Booking;
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
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ClassReminderSchedulerTest extends AbstractIntegrationTest {

    @Autowired ClassReminderScheduler scheduler;
    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
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

    private UUID newEntitledMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("reminder-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
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

    /** Fresh box, defaults to the standard 60-minute reminder lead unless overridden. */
    private UUID seedBox(Integer reminderMinutes) {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Reminder " + n);
        b.setSlug("reminder-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        if (reminderMinutes != null) b.setClassReminderMinutes(reminderMinutes);
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);
        return boxId;
    }

    private record Seed(UUID boxId, UUID sessionId, UUID bookedMembershipId) {}

    private ClassSession newSession(Instant startAt, int capacity) {
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(startAt);
        s.setDurationMin(60);
        s.setCapacity(capacity);
        return s;
    }

    private Seed seedBookedSessionStartingAt(Instant startAt) {
        UUID boxId = seedBox(null);
        UUID sessionId = sessions.save(newSession(startAt, 5)).getId();
        UUID membershipId = newEntitledMembership(boxId);
        bookingService.book(sessionId, membershipId);
        return new Seed(boxId, sessionId, membershipId);
    }

    private Seed seedCancelledSessionStartingAt(Instant startAt) {
        UUID boxId = seedBox(null);
        ClassSession s = newSession(startAt, 5);
        s.setStatus("CANCELLED");
        UUID sessionId = sessions.save(s).getId();
        UUID membershipId = newEntitledMembership(boxId);
        // Booking is on a live session/capacity path, so seed the notification-relevant fact
        // directly: a cancelled session is excluded by status before bookings even matter.
        return new Seed(boxId, sessionId, membershipId);
    }

    private Seed seedBoxWithReminderMinutesAndBookedSessionAt(int reminderMinutes, Instant startAt) {
        UUID boxId = seedBox(reminderMinutes);
        UUID sessionId = sessions.save(newSession(startAt, 5)).getId();
        UUID membershipId = newEntitledMembership(boxId);
        bookingService.book(sessionId, membershipId);
        return new Seed(boxId, sessionId, membershipId);
    }

    private record WaitlistSeed(UUID boxId, UUID sessionId, UUID bookedMembershipId, UUID waitlistedMembershipId) {}

    private WaitlistSeed seedSessionStartingAtWithBookedAndWaitlisted(Instant startAt) {
        UUID boxId = seedBox(null);
        UUID sessionId = sessions.save(newSession(startAt, 1)).getId();
        UUID booked = newEntitledMembership(boxId);
        UUID waitlisted = newEntitledMembership(boxId);
        bookingService.book(sessionId, booked);       // fills the only spot -> BOOKED
        bookingService.book(sessionId, waitlisted);   // -> WAITLIST
        return new WaitlistSeed(boxId, sessionId, booked, waitlisted);
    }

    /**
     * Real now, rounded up to the next hour. NOT a hardcoded instant: every session these tests
     * seed goes through BookingService.book, which rejects a class in the past with 409 PAST. This
     * file was pinned to 2026-09-10T05:00:00Z, so all eight of its tests began failing the moment
     * that date passed -- a date bomb, not a flake. Every offset here is a forward one measured
     * from this base, so the assertions stay exactly as deterministic as they were.
     */
    private static Instant testNow() {
        return Instant.now().truncatedTo(ChronoUnit.HOURS).plus(1, ChronoUnit.HOURS);
    }

    @Test
    void aClassStartingInTheLeadTimeRemindsItsBookedMembers() {
        Instant now = testNow();
        var seeded = seedBookedSessionStartingAt(now.plus(60, ChronoUnit.MINUTES)); // default lead 60

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.findAll()).singleElement().satisfies(n -> {
            assertThat(n.getType()).isEqualTo(NotificationType.CLASS_STARTING_SOON.name());
            assertThat(n.getMembershipId()).isEqualTo(seeded.bookedMembershipId());
        });
    }

    @Test
    void runningEveryMinuteRemindsOnce() {
        Instant now = testNow();
        var seeded = seedBookedSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));

        // The overlapping window re-covers this session on each of the next few sweeps.
        scheduler.sweepBox(seeded.boxId(), now);
        scheduler.sweepBox(seeded.boxId(), now.plus(1, ChronoUnit.MINUTES));
        scheduler.sweepBox(seeded.boxId(), now.plus(2, ChronoUnit.MINUTES));

        assertThat(notifications.count()).isOne();
    }

    @Test
    void aWaitlistedMemberIsNotReminded() {
        Instant now = testNow();
        var seeded = seedSessionStartingAtWithBookedAndWaitlisted(now.plus(60, ChronoUnit.MINUTES));

        scheduler.sweepBox(seeded.boxId(), now);

        // They have no place to turn up to. Reminding them would be a lie.
        assertThat(notifications.findAll()).hasSize(1)
                .extracting(Notification::getMembershipId)
                .containsExactly(seeded.bookedMembershipId());
    }

    @Test
    void aClassOutsideTheWindowIsNotReminded() {
        Instant now = testNow();
        var seeded = seedBookedSessionStartingAt(now.plus(4, ChronoUnit.HOURS));

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aCancelledClassIsNotReminded() {
        Instant now = testNow();
        var seeded = seedCancelledSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isZero();
    }

    @Test
    void theLeadTimeIsPerBox() {
        Instant now = testNow();
        var seeded = seedBoxWithReminderMinutesAndBookedSessionAt(30, now.plus(30, ChronoUnit.MINUTES));

        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isOne();
    }

    @Test
    void aMissedSweepIsStillCaughtByTheOverlapAndNotDoubleFired() {
        Instant now = testNow();
        Instant startAt = now.plus(60, ChronoUnit.MINUTES); // default lead 60
        var seeded = seedBookedSessionStartingAt(startAt);

        // Simulate a missed minute: the sweep at `now` (window [now+55, now+60]) never runs — a
        // redeploy, a slow run, a paused container. The next five sweeps all still overlap this
        // session (CATCH_UP=5), so the first of them catches what the missed one would have, and
        // the dedupe key means the rest of the overlap fires nobody twice.
        for (int minute = 1; minute <= 5; minute++) {
            scheduler.sweepBox(seeded.boxId(), now.plus(minute, ChronoUnit.MINUTES));
        }

        assertThat(notifications.count()).isOne();
    }

    @Test
    void theseRowsNeverReachTheFeed() {
        Instant now = testNow();
        var seeded = seedBookedSessionStartingAt(now.plus(60, ChronoUnit.MINUTES));
        scheduler.sweepBox(seeded.boxId(), now);

        assertThat(notifications.count()).isOne();
        // showsInFeed=false. Until M27c gives this a transport, the row exists and is shown to
        // nobody — which registry §5.5 permits only because a delivery milestone is named.
        assertThat(notifications.countUnread(seeded.bookedMembershipId(), NotificationType.feedTypeNames()))
                .isZero();
    }
}
