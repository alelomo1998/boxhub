package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A drop-in is a row in bookings, not its own table. Capacity is one count on bookings
 * (BookingService.java:58) — a separate table would make that count stop seeing visitors and a
 * class could be OVERSOLD. These tests pin that, and pin D13 (a paying visitor never waitlists).
 */
class DropInBookingTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("DI " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private User newUser(String email) {
        User u = new User();
        u.setEmail(email);
        u.setName("DI Person");
        u.setPasswordHash("x");
        return users.save(u);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newSession(UUID boxId) {
        ClassSession s = new ClassSession();
        s.setName("Open gym");
        s.setStartAt(Instant.now().plusSeconds(86400));
        s.setDurationMin(60);
        s.setCapacity(10);
        s.setStatus("SCHEDULED");
        return sessions.save(s).getId();
    }

    @Test
    void aVisitorBookingAndAMemberBookingCountTowardTheSameCapacity() {
        long n = System.nanoTime();
        Box a = newBox("di-a-" + n);
        actAsBox(a.getId());
        UUID sessionId = newSession(a.getId());

        User member = newUser("dim-" + n + "@t.io");
        Membership m = new Membership();
        m.setUser(member); m.setBox(a); m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        User visitor = newUser("div-" + n + "@t.io");

        Booking memberBooking = new Booking();
        memberBooking.setSessionId(sessionId);
        memberBooking.setMembershipId(membershipId);
        memberBooking.setStatus("BOOKED");
        bookings.save(memberBooking);

        Booking visitorBooking = new Booking();
        visitorBooking.setSessionId(sessionId);
        visitorBooking.setVisitorUserId(visitor.getId());
        visitorBooking.setStatus("BOOKED");
        bookings.save(visitorBooking);

        // THE POINT: one count, both rows. This is why a drop-in is not its own table.
        assertThat(bookings.countBySessionIdAndStatus(sessionId, "BOOKED")).isEqualTo(2);
    }

    @Test
    void aBookingMustHaveExactlyOneSubject() {
        long n = System.nanoTime();
        Box a = newBox("di-x-" + n);
        actAsBox(a.getId());
        UUID sessionId = newSession(a.getId());
        User visitor = newUser("dix-" + n + "@t.io");

        Booking neither = new Booking();
        neither.setSessionId(sessionId);
        neither.setStatus("BOOKED");
        assertThatThrownBy(() -> bookings.saveAndFlush(neither))
                .hasMessageContaining("ck_booking_subject");

        Membership m = new Membership();
        User member = newUser("diy-" + n + "@t.io");
        m.setUser(member); m.setBox(a); m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        Booking both = new Booking();
        both.setSessionId(sessionId);
        both.setMembershipId(membershipId);
        both.setVisitorUserId(visitor.getId());
        both.setStatus("BOOKED");
        assertThatThrownBy(() -> bookings.saveAndFlush(both))
                .hasMessageContaining("ck_booking_subject");
    }

    @Test
    void aPayingVisitorCanNotBeWaitlisted() {
        long n = System.nanoTime();
        Box a = newBox("di-w-" + n);
        actAsBox(a.getId());
        UUID sessionId = newSession(a.getId());
        User visitor = newUser("diw-" + n + "@t.io");

        Booking wl = new Booking();
        wl.setSessionId(sessionId);
        wl.setVisitorUserId(visitor.getId());
        wl.setStatus("WAITLIST");
        wl.setPosition(1);

        // Spec D13, enforced by the database rather than by remembering.
        assertThatThrownBy(() -> bookings.saveAndFlush(wl))
                .hasMessageContaining("ck_visitor_not_waitlist");
    }
}
