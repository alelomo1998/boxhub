package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProgrammingRepositoryTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired MovementRepository movements;
    @Autowired ClassSessionRepository sessions;
    @Autowired WodRepository wods;
    @Autowired SessionItemRepository items;
    @Autowired TemplatePieceRepository pieces;

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
    void sessionItemRoundTripAndSortUniqueness() {
        long n = System.nanoTime();
        UUID boxId = newBox("si-" + n);
        actAsBox(boxId);

        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        assertThat(s.getProgrammingStatus()).isEqualTo("DRAFT");

        Wod w = new Wod();
        w.setTitle("Fran");
        w.setMacro("WORKOUT");
        w.setTimingPreset("FOR_TIME");
        w.setScoreType("TIME");
        wods.save(w);

        SessionItem i1 = new SessionItem();
        i1.setSessionId(s.getId());
        i1.setWodId(w.getId());
        i1.setSortOrder(0);
        i1.setScoreable(true);
        items.saveAndFlush(i1);
        assertThat(items.findBySessionIdOrderBySortOrderAsc(s.getId())).hasSize(1);

        SessionItem dup = new SessionItem();
        dup.setSessionId(s.getId());
        dup.setWodId(w.getId());
        dup.setSortOrder(0);
        assertThatThrownBy(() -> items.saveAndFlush(dup)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void skeletonPiecesOrderPerClassType() {
        long n = System.nanoTime();
        UUID boxId = newBox("sk-" + n);
        actAsBox(boxId);
        com.boxhub.box.ClassType t = new com.boxhub.box.ClassType();
        t.setName("Muscle Class");
        UUID classTypeId = typesRepo.save(t).getId();

        TemplatePiece p1 = new TemplatePiece();
        p1.setClassTypeId(classTypeId); p1.setSortOrder(1); p1.setLabel("Strength"); p1.setMacro("STRENGTH");
        pieces.save(p1);
        TemplatePiece p0 = new TemplatePiece();
        p0.setClassTypeId(classTypeId); p0.setSortOrder(0); p0.setLabel("Warm-up"); p0.setMacro("WARMUP");
        pieces.save(p0);

        assertThat(pieces.findByClassTypeIdOrderBySortOrderAsc(classTypeId))
                .extracting(TemplatePiece::getLabel).containsExactly("Warm-up", "Strength");
    }

    @Autowired com.boxhub.box.ClassTypeRepository typesRepo;
}
