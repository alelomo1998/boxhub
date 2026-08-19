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

class ClassTypeSlotSchemaTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;

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
    void aTypeMayExistWithZeroSlots() {          // spec decision 12
        UUID boxId = newBox("m14a-" + System.nanoTime());
        actAsBox(boxId);
        ClassType t = new ClassType();
        t.setName("Barbell Club");
        types.save(t);

        assertThat(types.findById(t.getId())).isPresent();
        assertThat(slots.findByActiveTrue().stream().anyMatch(s -> s.getClassTypeId().equals(t.getId())))
                .isFalse();
    }

    @Test
    void aSlotCarriesItsOwnDurationCapacityAndCoach() {   // spec decision 2
        UUID boxId = newBox("m14a-" + System.nanoTime());
        actAsBox(boxId);
        ClassType t = new ClassType();
        t.setName("WOD");
        types.save(t);

        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(t.getId());
        s.setWeekday(0);
        s.setStartTime(LocalTime.of(6, 0));
        s.setDurationMin(60);
        s.setCapacity(12);
        slots.save(s);

        ScheduleSlot found = slots.findById(s.getId()).orElseThrow();
        assertThat(found.getDurationMin()).isEqualTo(60);
        assertThat(found.getCapacity()).isEqualTo(12);
    }
}
