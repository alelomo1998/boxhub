package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.*;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SessionGenerationTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionGenerator generator;

    static final ZoneId ROME = ZoneId.of("Europe/Rome");

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
    }

    @Test
    void generatesIdempotentlyWithinHorizonPreservingWallClock() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Gen " + n);
        box.setSlug("gen-" + n);
        box.setTimezone("Europe/Rome");
        box.setBookingHorizonWeeks(2);
        boxes.save(box);
        UUID boxId = box.getId();

        // a slot on Wednesday (weekday 2) at 10:00
        actAsBox(boxId);
        ClassType t = new ClassType();
        t.setName("Wed 10:00");
        types.save(t);

        ScheduleSlot slot = new ScheduleSlot();
        slot.setClassTypeId(t.getId());
        slot.setWeekday(2);
        slot.setStartTime(LocalTime.of(10, 0));
        slot.setDurationMin(60);
        slot.setCapacity(10);
        slots.save(slot);
        SecurityContextHolder.clearContext();

        generator.generateForBox(boxId);
        actAsBox(boxId);
        List<ClassSession> first = sessions.findByStartAtBetweenOrderByStartAt(
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(3600L * 24 * 30));
        SecurityContextHolder.clearContext();

        assertThat(first).isNotEmpty();
        LocalDate horizonEnd = LocalDate.now(ROME).plusWeeks(2);
        for (ClassSession s : first) {
            ZonedDateTime z = s.getStartAt().atZone(ROME);
            assertThat(z.getDayOfWeek()).isEqualTo(DayOfWeek.WEDNESDAY);   // correct weekday
            assertThat(z.getHour()).isEqualTo(10);                          // wall-clock preserved (incl. across DST)
            assertThat(z.getMinute()).isEqualTo(0);
            assertThat(s.getStartAt()).isAfter(Instant.now().minusSeconds(1)); // no past slots
            assertThat(!z.toLocalDate().isAfter(horizonEnd)).isTrue();      // within horizon
        }

        // second run is idempotent — no duplicates
        generator.generateForBox(boxId);
        actAsBox(boxId);
        List<ClassSession> second = sessions.findByStartAtBetweenOrderByStartAt(
                Instant.now().minusSeconds(1), Instant.now().plusSeconds(3600L * 24 * 30));
        SecurityContextHolder.clearContext();
        assertThat(second).hasSameSizeAs(first);
    }
}
