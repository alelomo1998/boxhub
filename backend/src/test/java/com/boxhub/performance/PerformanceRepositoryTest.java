package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.programming.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PerformanceRepositoryTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired ClassSessionRepository sessions;
    @Autowired WodRepository wods;
    @Autowired SessionItemRepository items;
    @Autowired MovementRepository movements;
    @Autowired WodScoreRepository scores;
    @Autowired LiftEntryRepository lifts;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Perf " + slug);
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
    void scoreRoundTripUniqueAndLiftMax() {
        long n = System.nanoTime();
        UUID boxId = newBox("perf-" + n);
        actAsBox(boxId);

        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        s.setProgrammingStatus("PUBLISHED");
        sessions.save(s);

        Wod w = new Wod(); w.setTitle("Fran"); w.setMacro("WORKOUT"); w.setTimingPreset("FOR_TIME"); w.setScoreType("TIME"); wods.save(w);
        SessionItem item = new SessionItem();
        item.setSessionId(s.getId()); item.setWodId(w.getId()); item.setSortOrder(0); item.setScoreable(true);
        item.setScoreType("TIME");
        items.save(item);

        User u = authService.register("perf-" + n + "@t.io", "correct-horse-battery", "Ath");
        Membership m = new Membership();
        m.setUser(u); m.setBox(boxes.findById(boxId).orElseThrow()); m.setRole("ATHLETE");
        UUID mid = memberships.save(m).getId();

        WodScore sc = new WodScore();
        sc.setSessionItemId(item.getId()); sc.setMembershipId(mid); sc.setTimeSeconds(180);
        scores.saveAndFlush(sc);
        assertThat(scores.findBySessionItemIdAndMembershipId(item.getId(), mid)).isPresent();

        WodScore dup = new WodScore();
        dup.setSessionItemId(item.getId()); dup.setMembershipId(mid); dup.setTimeSeconds(200);
        assertThatThrownBy(() -> scores.saveAndFlush(dup)).isInstanceOf(DataIntegrityViolationException.class);

        Movement mv = new Movement(); mv.setBoxId(boxId); mv.setName("Back Squat " + n); mv.setCategory("BARBELL");
        movements.save(mv);
        lift(mid, mv.getId(), "100.0");
        lift(mid, mv.getId(), "120.5");
        assertThat(lifts.maxLoad(mid, mv.getId())).isEqualByComparingTo("120.5");
    }

    private void lift(UUID mid, UUID mvId, String load) {
        LiftEntry l = new LiftEntry();
        l.setMembershipId(mid); l.setMovementId(mvId); l.setLoad(new BigDecimal(load));
        l.setPerformedOn(LocalDate.now());
        lifts.save(l);
    }
}
