package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spec D14: a coach is assumed to work at ONE box for now, but the schema is cut multi-box-ready
 * so enabling it later needs no migration. That readiness is exactly "these tables are keyed on
 * the user and are NOT tenant-scoped" — if anyone adds @TenantId, a coach's profile and calendar
 * would vanish when they switch box, which is docs/TENANCY.md failure mode 1.
 */
class CoachProfileTenancyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired CoachProfileRepository profiles;
    @Autowired CoachAvailabilityRepository availability;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Coach " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private UUID newUserId(String email) {
        User u = new User();
        u.setEmail(email);
        u.setName("Coach Person");
        u.setPasswordHash("x");
        return users.save(u).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "COACH")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void aCoachProfileAndCalendarReadIdenticallyFromEitherBox() {
        long n = System.nanoTime();
        UUID a = newBoxId("cp-a-" + n);
        UUID b = newBoxId("cp-b-" + n);
        UUID coach = newUserId("cp-" + n + "@t.io");

        actAsBox(a);
        CoachProfile p = new CoachProfile();
        p.setUserId(coach);
        p.setBio("Ten years of barbell " + n);
        p.setPriceCents(5000);
        p.setCurrency("EUR");
        profiles.save(p);

        CoachAvailability slot = new CoachAvailability();
        slot.setUserId(coach);
        slot.setWeekday(1);
        slot.setStartTime(LocalTime.parse("09:00"));
        slot.setEndTime(LocalTime.parse("12:00"));
        availability.save(slot);

        // The same person, read from the OTHER box. One profile, one calendar.
        actAsBox(b);
        assertThat(profiles.findById(coach)).isPresent()
                .get().extracting(CoachProfile::getBio).isEqualTo("Ten years of barbell " + n);
        assertThat(availability.findByUserIdOrderByWeekdayAscStartTimeAsc(coach)).hasSize(1);
    }

    @Test
    void payeeDefaultsToCoach() {
        long n = System.nanoTime();
        UUID coach = newUserId("payee-" + n + "@t.io");

        CoachProfile p = new CoachProfile();
        p.setUserId(coach);
        profiles.saveAndFlush(p);

        // Spec D2: per-coach choice, coach-direct is the default.
        assertThat(profiles.findById(coach)).get()
                .extracting(CoachProfile::getPayee).isEqualTo("COACH");
    }
}
