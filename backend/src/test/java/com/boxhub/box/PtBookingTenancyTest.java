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

/**
 * pt_booking is box-operational, so it IS @TenantId. Note what this means and is recorded in the
 * spec: computing a coach's real free slots once they work at TWO boxes needs a cross-box read,
 * which is deferred to M26 by D14 and needs a registered native query, never runAsRoot.
 */
class PtBookingTenancyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired PtBookingRepository ptBookings;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("PT " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private User newUser(String email) {
        User u = new User();
        u.setEmail(email);
        u.setName("PT Person");
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

    @Test
    void ptBookingsAreIsolatedPerBox() {
        long n = System.nanoTime();
        Box a = newBox("pt-a-" + n);
        Box b = newBox("pt-b-" + n);
        User coach = newUser("ptc-" + n + "@t.io");
        User athlete = newUser("pta-" + n + "@t.io");

        actAsBox(a.getId());
        Membership m = new Membership();
        m.setUser(coach);
        m.setBox(a);
        m.setRole("COACH");
        UUID coachMembership = memberships.save(m).getId();

        PtBooking pt = new PtBooking();
        pt.setCoachMembershipId(coachMembership);
        pt.setAthleteUserId(athlete.getId());
        pt.setStartsAt(Instant.now().plusSeconds(86400));
        pt.setDurationMin(60);
        pt.setStatus("REQUESTED");
        pt.setPriceCents(5000);
        pt.setCurrency("EUR");
        ptBookings.save(pt);

        assertThat(ptBookings.findAll()).hasSize(1);

        actAsBox(b.getId()); // the other box must not see it
        assertThat(ptBookings.findAll()).isEmpty();
    }
}
