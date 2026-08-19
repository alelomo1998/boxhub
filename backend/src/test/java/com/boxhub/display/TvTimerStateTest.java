package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.programming.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TvTimerStateTest extends AbstractIntegrationTest {

    @Autowired TvStateService state;
    @Autowired TimerService timerService;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg","HS256").subject(UUID.randomUUID().toString())
                .claim("scope","box").claim("box_id", boxId.toString()).claim("role","BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void runningTimerAppearsWithPieceCaption() {
        long n = System.nanoTime();
        Box a = new Box(); a.setName("tvt-" + n); a.setSlug("tvt-" + n); a.setTimezone("Europe/Rome"); a = boxes.save(a);
        actAsBox(a.getId());
        ClassSession s = new ClassSession(); s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(300));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED"); s = sessions.save(s);
        Wod fran = new Wod(); fran.setTitle("Fran"); fran.setMacro("WORKOUT"); fran.setTimingPreset("FOR_TIME"); fran.setScoreType("TIME");
        fran.setBodyText("21-15-9"); fran = wods.save(fran);
        SessionItem it = new SessionItem(); it.setSessionId(s.getId()); it.setSortOrder(0);
        it.setWodId(fran.getId()); it.setScoreable(true); it = items.save(it);

        timerService.act(s.getId(), "ARM", it.getId(), "{\"type\":\"AMRAP\",\"totalSeconds\":600}");
        timerService.act(s.getId(), "START", null, null);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.timer()).isNotNull();
        assertThat(st.timer().type()).isEqualTo("AMRAP");
        assertThat(st.timer().totalSeconds()).isEqualTo(600);
        assertThat(st.timer().status()).isEqualTo("RUNNING");
        assertThat(st.timer().startAtEpoch()).isNotNull();
        assertThat(st.timer().pieceTitle()).isEqualTo("Fran");
    }
}
