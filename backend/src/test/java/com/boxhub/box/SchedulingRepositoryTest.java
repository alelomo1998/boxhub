package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
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

class SchedulingRepositoryTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassTemplateRepository templates;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired org.springframework.transaction.PlatformTransactionManager txManager;
    @Autowired com.boxhub.identity.AuthService authService;
    @Autowired com.boxhub.identity.MembershipRepository memberships;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Sched " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void persistsTemplateSessionBookingAndLocks() {
        long n = System.nanoTime();
        UUID boxId = newBox("sched-" + n);
        actAsBox(boxId);

        ClassTemplate t = new ClassTemplate();
        t.setName("WOD 06:00");
        t.setWeekday(0);
        t.setStartTime(LocalTime.of(6, 0));
        t.setDurationMin(60);
        t.setCapacity(12);
        templates.save(t);
        assertThat(templates.findByActiveTrue()).extracting(ClassTemplate::getName).contains("WOD 06:00");

        ClassSession s = new ClassSession();
        s.setTemplateId(t.getId());
        s.setName("WOD 06:00");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        assertThat(sessions.existsByTemplateIdAndStartAt(t.getId(), s.getStartAt())).isTrue();
        // pessimistic lock query needs an active tx (prod callers are @Transactional)
        UUID sid = s.getId();
        new org.springframework.transaction.support.TransactionTemplate(txManager)
                .executeWithoutResult(x -> assertThat(sessions.findWithLockById(sid)).isPresent());

        com.boxhub.identity.User u = authService.register("sch-" + n + "@t.io", "correct-horse-battery", "Ath");
        com.boxhub.box.Box box = boxes.findById(boxId).orElseThrow();
        com.boxhub.identity.Membership m = new com.boxhub.identity.Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        Booking b = new Booking();
        b.setSessionId(s.getId());
        b.setMembershipId(membershipId);
        b.setStatus("BOOKED");
        bookings.save(b);
        assertThat(bookings.countBySessionIdAndStatus(s.getId(), "BOOKED")).isEqualTo(1);
        assertThat(bookings.findBySessionIdAndMembershipId(s.getId(), b.getMembershipId())).isPresent();
    }
}
