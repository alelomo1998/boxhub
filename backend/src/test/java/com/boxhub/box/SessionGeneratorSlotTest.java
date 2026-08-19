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

class SessionGeneratorSlotTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired SessionGenerator generator;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired ClassSessionRepository sessions;

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
    void generatedSessionsSnapshotTheSlotAndNameTheType() {
        UUID boxId = newBox("m14a-" + System.nanoTime());
        actAsBox(boxId);

        ClassType t = new ClassType();
        t.setName("Metcon");
        types.save(t);

        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(t.getId());
        s.setWeekday(2);
        s.setStartTime(LocalTime.of(18, 0));
        s.setDurationMin(45);
        s.setCapacity(14);
        slots.save(s);

        generator.generateForBox(boxId);

        var generated = sessions.findAll().stream()
                .filter(cs -> s.getId().equals(cs.getScheduleSlotId()))
                .toList();

        assertThat(generated).isNotEmpty();
        assertThat(generated).allSatisfy(cs -> {
            assertThat(cs.getName()).isEqualTo("Metcon");     // name comes from the TYPE
            assertThat(cs.getDurationMin()).isEqualTo(45);    // numbers come from the SLOT
            assertThat(cs.getCapacity()).isEqualTo(14);
        });
    }

    @Test
    void generationIsIdempotent() {
        UUID boxId = newBox("m14a-" + System.nanoTime());
        actAsBox(boxId);
        ClassType t = new ClassType(); t.setName("Open Gym"); types.save(t);
        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(t.getId()); s.setWeekday(4); s.setStartTime(LocalTime.of(7, 0));
        s.setDurationMin(60); s.setCapacity(20); slots.save(s);

        generator.generateForBox(boxId);
        long first = sessions.count();
        generator.generateForBox(boxId);

        assertThat(sessions.count()).isEqualTo(first);
    }
}
