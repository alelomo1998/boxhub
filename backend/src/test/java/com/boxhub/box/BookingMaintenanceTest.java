package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The nightly no-show sweep, exercised the way the scheduler actually runs it: through
 * BookingMaintenance, with NO security context, across TWO boxes.
 *
 * Its predecessor (SessionApiTest#sweepFlipsPastBookedToNoShow) ran under actAsBox(boxA) and so
 * never touched that path at all — it would have stayed green while the sweep silently stopped
 * flipping anything, in every box, forever.
 */
class BookingMaintenanceTest extends AbstractIntegrationTest {

    @Autowired BookingMaintenance maintenance;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void nightlySweepFlipsPastBookedToNoShowInEveryBox() {
        long n = System.nanoTime();
        UUID boxA = newBox("Sweep MA " + n, "sweep-ma-" + n);
        UUID boxB = newBox("Sweep MB " + n, "sweep-mb-" + n);
        UUID bookingA = pastBooking(boxA, "ma-" + n);
        UUID bookingB = pastBooking(boxB, "mb-" + n);

        // The scheduler runs with no security context at all. That is the whole point of this test:
        // under M21's fail-closed default a sweep without runAsRoot sees zero sessions and flips
        // nothing, in silence, in every box.
        SecurityContextHolder.clearContext();
        maintenance.nightlyNoShowSweep();

        assertThat(TenantContext.runAsBox(boxA, () -> bookings.findById(bookingA).orElseThrow().getStatus()))
                .isEqualTo("NO_SHOW");
        assertThat(TenantContext.runAsBox(boxB, () -> bookings.findById(bookingB).orElseThrow().getStatus()))
                .isEqualTo("NO_SHOW");
    }

    private UUID newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    /** A started-but-unmarked BOOKED row in {@code boxId} — exactly what the nightly sweep is for. */
    private UUID pastBooking(UUID boxId, String tag) {
        User u = authService.register("bm-" + tag + "@t.io", "correct-horse-battery", "BM " + tag);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(boxId).orElseThrow());
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        UUID membershipId = memberships.save(m).getId();

        return TenantContext.runAsBox(boxId, () -> {
            ClassSession s = new ClassSession();
            s.setName("Past " + tag);
            s.setStartAt(Instant.now().minusSeconds(3600));
            s.setDurationMin(60);
            s.setCapacity(10);
            UUID sessionId = sessions.save(s).getId();

            Booking b = new Booking();
            b.setSessionId(sessionId);
            b.setMembershipId(membershipId);
            b.setStatus("BOOKED");
            return bookings.save(b).getId();
        });
    }
}
