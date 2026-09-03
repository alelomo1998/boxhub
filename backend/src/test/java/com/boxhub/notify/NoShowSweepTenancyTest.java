package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Booking;
import com.boxhub.box.BookingMaintenance;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.shared.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The tenancy half of the no-show sweep: it must notify each box's members under THAT box's id.
 *
 * <p>BookingMaintenance used to wrap the sweep in runAsRoot, which was safe only while the sweep
 * never INSERTed a @TenantId row. A notification is one, and under root it would take the sentinel
 * box_id — written, but invisible to the member it was written for. A count-only assertion would
 * pass in exactly that failure, which is why both tests here read rows back through a real tenant.
 */
class NoShowSweepTenancyTest extends AbstractIntegrationTest {

    @Autowired BookingMaintenance maintenance;
    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private record Seeded(UUID boxId, UUID membershipId) {}

    @Test
    void theSweepNotifiesEachBoxsMembersUnderTheirOwnBoxId() {
        long n = System.nanoTime();
        Seeded boxA = seedBoxWithUnmarkedBooking("nsA-" + n);
        Seeded boxB = seedBoxWithUnmarkedBooking("nsB-" + n);

        SecurityContextHolder.clearContext();   // the scheduler runs with no security context
        maintenance.nightlyNoShowSweep();

        // Read across boxes: runAsRoot for an ASSERTION is correct — a platform-wide read, not a
        // thread serving a user. Filtered to the two boxes this test seeded, because the suite
        // shares one Postgres container with no rollback: every other class's notifications are
        // still in the table, so an unfiltered hasSize() would measure the whole suite's history.
        List<Notification> mine = TenantContext.runAsRoot(() -> notifications.findAll()).stream()
                .filter(x -> x.getBoxId().equals(boxA.boxId()) || x.getBoxId().equals(boxB.boxId()))
                .toList();

        assertThat(mine).hasSize(2).allSatisfy(x ->
                assertThat(x.getType()).isEqualTo(NotificationType.NO_SHOW_RECORDED.name()));
        // The point of the whole task: each row carries ITS OWN box, never a shared sentinel. If the
        // sweep still ran as root the rows would carry the sentinel, the filter above would drop
        // them both, and hasSize(2) would fail — which is the regression this test exists to catch.
        assertThat(mine).extracting(Notification::getBoxId)
                .containsExactlyInAnyOrder(boxA.boxId(), boxB.boxId());
        assertThat(mine).extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrder(boxA.membershipId(), boxB.membershipId());
    }

    @Test
    void aMemberSeesTheirOwnNoShowThroughTheirOwnTenant() {
        Seeded boxA = seedBoxWithUnmarkedBooking("nsOwn-" + System.nanoTime());

        SecurityContextHolder.clearContext();
        maintenance.nightlyNoShowSweep();

        // A sentinel box_id would make this read return EMPTY even though the row exists — precisely
        // the failure mode a count-only assertion would miss.
        var seen = TenantContext.runAsBox(boxA.boxId(), () ->
                notifications.findByMembershipIdAndTypeInAndReadAtIsNull(
                        boxA.membershipId(), List.of(NotificationType.NO_SHOW_RECORDED.name())));

        assertThat(seen).hasSize(1);
        assertThat(seen.getFirst().getBoxId()).isEqualTo(boxA.boxId());
    }

    /**
     * A started-but-unmarked BOOKED row in a fresh box, seeded directly rather than through
     * BookingService.book() — book() rejects a session that has already started, which is exactly
     * the state the sweep exists to clean up. Shape copied from BookingMaintenanceTest.
     */
    private Seeded seedBoxWithUnmarkedBooking(String tag) {
        Box b = new Box();
        b.setName("Sweep " + tag);
        b.setSlug("sweep-" + tag.toLowerCase());
        b.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(b).getId();

        User u = authService.register("ns-" + tag + "@t.io", "correct-horse-battery", "NS " + tag);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(boxId).orElseThrow());
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        UUID membershipId = memberships.save(m).getId();

        TenantContext.runAsBox(boxId, () -> {
            ClassSession s = new ClassSession();
            s.setName("Past " + tag);
            // Explicitly relative to now: a precondition that depends on the time of day is a
            // broken test, not a caveat to document.
            s.setStartAt(Instant.now().minusSeconds(7200));
            s.setDurationMin(60);
            s.setCapacity(10);
            UUID sessionId = sessions.save(s).getId();

            Booking bk = new Booking();
            bk.setSessionId(sessionId);
            bk.setMembershipId(membershipId);
            bk.setStatus("BOOKED");
            return bookings.save(bk).getId();
        });

        return new Seeded(boxId, membershipId);
    }
}
