package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProgrammingRepositoryTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired MovementRepository movements;
    @Autowired TrackRepository tracks;
    @Autowired WodRepository wods;
    @Autowired ProgramSlotRepository slots;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Prog " + slug);
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

    private Movement movement(UUID boxId, String name) {
        Movement m = new Movement();
        m.setBoxId(boxId);
        m.setName(name);
        m.setCategory("BARBELL");
        return movements.save(m);
    }

    @Test
    void movementVisibilityHonoursGlobalAndBoxScope() {
        long n = System.nanoTime();
        UUID a = newBox("mv-a-" + n);
        UUID b = newBox("mv-b-" + n);
        movement(null, "Global Thruster " + n);
        movement(a, "A Custom " + n);
        movement(b, "B Custom " + n);

        assertThat(movements.findVisible(a)).extracting(Movement::getName)
                .contains("Global Thruster " + n, "A Custom " + n)
                .doesNotContain("B Custom " + n);
        assertThat(movements.findVisible(b)).extracting(Movement::getName)
                .contains("Global Thruster " + n, "B Custom " + n)
                .doesNotContain("A Custom " + n);
    }

    @Test
    void trackWodSlotRoundTripAndSlotUniqueness() {
        long n = System.nanoTime();
        UUID boxId = newBox("tws-" + n);
        actAsBox(boxId);

        Track t = new Track();
        t.setName("RX");
        tracks.save(t);
        assertThat(tracks.findByArchivedFalseOrderBySortOrderAsc()).extracting(Track::getName).contains("RX");

        Wod w = new Wod();
        w.setTitle("Fran");
        w.setWodType("FOR_TIME");
        w.setScoreType("TIME");
        wods.save(w);
        assertThat(wods.findByOrderByUpdatedAtDesc()).extracting(Wod::getTitle).contains("Fran");

        LocalDate d = LocalDate.now();
        ProgramSlot s1 = new ProgramSlot();
        s1.setSlotDate(d);
        s1.setTrackId(t.getId());
        s1.setWodId(w.getId());
        slots.saveAndFlush(s1);
        assertThat(slots.findBySlotDateAndTrackId(d, t.getId())).isPresent();

        ProgramSlot dup = new ProgramSlot();
        dup.setSlotDate(d);
        dup.setTrackId(t.getId());
        dup.setWodId(w.getId());
        assertThatThrownBy(() -> slots.saveAndFlush(dup)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
