package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class WodLibraryCopyTest extends AbstractIntegrationTest {

    @Autowired WodService wods;
    @Autowired WodRepository wodRepo;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    // Tenant pattern copied from SchedulingRepositoryTest: a Jwt pushed into SecurityContextHolder.
    private void seedBoxAndAuthenticate() {
        Box b = new Box();
        long n = System.nanoTime();
        b.setName("Wod Lib " + n);
        b.setSlug("wod-lib-" + n);
        b.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(b).getId();
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Wod seedLibraryWod(String title) {
        Wod w = new Wod();
        w.setTitle(title);
        w.setMacro("WORKOUT");
        w.setTimingPreset("FOR_TIME");
        w.setScoreType("TIME");
        w.setLibrary(true);
        return wodRepo.save(w);
    }

    private ClassSession seedSession() {
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        return sessions.save(s);
    }

    @Test
    void attachingALibraryWodCopiesItSoTheClassOwnsItsContent() {   // spec decision 3
        seedBoxAndAuthenticate();
        Wod library = seedLibraryWod("Fran");        // helper: library = true
        var session = seedSession();

        var item = wods.attachToSession(library.getId(), session.getId(), 0);

        assertThat(item.getWodId()).isNotEqualTo(library.getId());
        Wod copy = wodRepo.findById(item.getWodId()).orElseThrow();
        assertThat(copy.isLibrary()).isFalse();
        assertThat(copy.getTitle()).isEqualTo("Fran");
    }

    @Test
    void editingTheLibraryEntryDoesNotChangeAClassThatAlreadyRan() {
        seedBoxAndAuthenticate();
        Wod library = seedLibraryWod("Cindy");
        var session = seedSession();
        var item = wods.attachToSession(library.getId(), session.getId(), 0);

        library.setTitle("Cindy (modified)");
        wodRepo.save(library);

        Wod copy = wodRepo.findById(item.getWodId()).orElseThrow();
        assertThat(copy.getTitle()).isEqualTo("Cindy");
    }

    @Test
    void reSavingAnAttachedPieceUpdatesInPlaceAndDoesNotGrowTheLibrary() {
        // the filed unbounded-growth bug: quick-created pieces became library wods on every re-save
        seedBoxAndAuthenticate();
        var session = seedSession();
        Wod library = seedLibraryWod("Helen");
        var item = wods.attachToSession(library.getId(), session.getId(), 0);

        long libraryCountBefore = wodRepo.findAll().stream().filter(Wod::isLibrary).count();

        Wod copy = wodRepo.findById(item.getWodId()).orElseThrow();
        copy.setTitle("Helen, scaled");
        wodRepo.save(copy);
        copy.setTitle("Helen, scaled again");
        wodRepo.save(copy);

        long libraryCountAfter = wodRepo.findAll().stream().filter(Wod::isLibrary).count();
        assertThat(libraryCountAfter).isEqualTo(libraryCountBefore);
    }
}
