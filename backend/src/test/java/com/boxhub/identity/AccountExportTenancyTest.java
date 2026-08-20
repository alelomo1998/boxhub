package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.programming.Movement;
import com.boxhub.programming.MovementRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GET /api/me/export is served to a BOXLESS session — a user token carries no box_id claim.
 * Since M21 a tenant-less read of a @TenantId entity fails CLOSED and returns empty, and
 * AccountService.export reads bookings through PerformanceQueries.bookingsOf ->
 * BookingRepository.findByMembershipId, a plain derived query on the @TenantId Booking entity.
 *
 * The two shipped tests cannot see this: exportContainsTheUsersOwnData asserts keys only, on a
 * fixture with no bookings at all, and anonymizationLeavesBookingsScoresAndLiftsIntact runs under
 * actAsBox. This one seeds a real booking and then clears the SecurityContext entirely, which is
 * what production does. See docs/M22-T7-FINDING.md.
 */
class AccountExportTenancyTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired AccountService accounts;
    @Autowired MembershipRepository memberships;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired LiftEntryRepository lifts;
    @Autowired MovementRepository movements;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void exportReturnsTheUsersBookingsFromABoxlessSession() {
        long n = System.nanoTime();

        Box b = new Box();
        b.setName("Export Box");
        b.setSlug("export-box-" + n);
        b.setTimezone("Europe/Rome");
        b = boxes.save(b);

        User u = new User();
        u.setEmail("export-" + n + "@t.io");
        u.setName("Export Person");
        u.setPasswordHash("x");
        u = users.save(u);

        actAsBox(b.getId());

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        ClassSession s = new ClassSession();
        s.setName("Export session");
        s.setStartAt(Instant.now().plusSeconds(86400));
        s.setDurationMin(60);
        s.setCapacity(10);
        s.setStatus("SCHEDULED");
        UUID sessionId = sessions.save(s).getId();

        Booking bk = new Booking();
        bk.setSessionId(sessionId);
        bk.setMembershipId(membershipId);
        bk.setStatus("BOOKED");
        bookings.save(bk);

        Movement mv = new Movement();
        mv.setBoxId(b.getId());
        mv.setName("Export Squat " + n);
        mv.setCategory("BARBELL");
        UUID movementId = movements.save(mv).getId();

        LiftEntry lift = new LiftEntry();
        lift.setMembershipId(membershipId);
        lift.setMovementId(movementId);
        lift.setLoad(new BigDecimal("100.0"));
        lift.setReps(1);
        lift.setPerformedOn(LocalDate.now());
        lifts.save(lift);

        // THE POINT: production serves this route to a user token, which carries no box_id.
        SecurityContextHolder.clearContext();

        Map<String, Object> dump = accounts.export(u.getId());

        assertThat((List<Map<String, Object>>) dump.get("bookings"))
                .as("a boxless GDPR export must still return the user's own bookings")
                .isNotEmpty();
        assertThat((List<Map<String, Object>>) dump.get("lifts"))
                .as("a boxless GDPR export must still return the user's own lifts")
                .isNotEmpty();
    }
}
