package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
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

class TvStateServiceTest extends AbstractIntegrationTest {

    @Autowired TvStateService state;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired BookingRepository bookings;
    @Autowired WodScoreRepository scores;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private Membership member(Box box, String email, String name) {
        User u = authService.register(email, "correct-horse-battery", name);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole("ATHLETE");
        return memberships.save(m);
    }

    @Test
    void liveClassWithRankedRailAndPrivateExcluded() {
        long n = System.nanoTime();
        Box a = newBox("tvs-a-" + n);
        actAsBox(a.getId());

        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED");
        s = sessions.save(s);

        Wod fran = new Wod(); fran.setTitle("Fran"); fran.setWodType("FOR_TIME"); fran.setScoreType("TIME");
        fran.setBodyText("21-15-9"); fran = wods.save(fran);
        SessionItem it = new SessionItem();
        it.setSessionId(s.getId()); it.setSortOrder(0); it.setWodId(fran.getId()); it.setScoreable(true);
        it = items.save(it);

        Membership m1 = member(a, "tv1-" + n + "@t.io", "Fast Athlete");
        Membership m2 = member(a, "tv2-" + n + "@t.io", "Quiet Athlete");
        Membership m3 = member(a, "tv3-" + n + "@t.io", "Unscored Athlete");
        for (Membership m : java.util.List.of(m1, m2, m3)) {
            Booking b = new Booking(); b.setSessionId(s.getId()); b.setMembershipId(m.getId()); b.setStatus("BOOKED");
            bookings.save(b);
        }
        WodScore sc1 = new WodScore(); sc1.setSessionItemId(it.getId()); sc1.setMembershipId(m1.getId());
        sc1.setRx(true); sc1.setTimeSeconds(201); sc1.setFinished(true); scores.save(sc1);
        WodScore sc2 = new WodScore(); sc2.setSessionItemId(it.getId()); sc2.setMembershipId(m2.getId());
        sc2.setRx(true); sc2.setTimeSeconds(180); sc2.setFinished(true); sc2.setPrivate(true); scores.save(sc2);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.view()).isEqualTo("CLASS");
        assertThat(st.session().name()).isEqualTo("WOD Class");
        assertThat(st.items()).extracting(TvStateService.ItemInfo::title).containsExactly("Fran");
        // ranked first (private excluded from ranking), then plain roster
        assertThat(st.rail().get(0).name()).isEqualTo("Fast Athlete");
        assertThat(st.rail().get(0).rank()).isEqualTo(1);
        assertThat(st.rail().get(0).score()).isEqualTo("3:21");
        // private athlete still in roster (privacy hides the score, not the person), just unranked
        TvStateService.RailRow quiet = st.rail().stream()
                .filter(r -> r.name().equals("Quiet Athlete")).findFirst().orElseThrow();
        assertThat(quiet.rank()).isNull();
        assertThat(quiet.score()).isNull();
        assertThat(st.timer()).isNull();
    }

    /**
     * The TV runs all day off SSE pushes with a short (10 min) signed-URL lifetime; it only
     * survives that if compose() mints a fresh signature every single call rather than caching
     * or reusing one from the stored avatarPath. Proven directly: two compose() calls across a
     * real second boundary must produce two DIFFERENT signed URLs for the same underlying path.
     */
    @Test
    void railAvatarPathsAreSignedFreshOnEveryCompose() throws InterruptedException {
        long n = System.nanoTime();
        Box a = newBox("tvs-sign-" + n);
        actAsBox(a.getId());

        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED");
        s = sessions.save(s);

        Membership m = member(a, "tvsign-" + n + "@t.io", "Signed Athlete");
        m.setAvatarPath("/media/" + a.getId() + "/pic.jpg");
        memberships.save(m);
        Booking b = new Booking(); b.setSessionId(s.getId()); b.setMembershipId(m.getId()); b.setStatus("BOOKED");
        bookings.save(b);

        TvStateService.TvState first = state.compose(a.getId());
        String firstAvatar = first.rail().get(0).avatarPath();
        assertThat(firstAvatar).contains("?md5=").contains("&expires=");

        Thread.sleep(1100); // cross a whole-second boundary; expires is epoch-seconds
        TvStateService.TvState second = state.compose(a.getId());
        String secondAvatar = second.rail().get(0).avatarPath();
        assertThat(secondAvatar).isNotEqualTo(firstAvatar); // proves compose() re-signs, not caches
    }

    @Test
    void noShowExcludedFromRail() {
        long n = System.nanoTime();
        Box a = newBox("tvs-ns-" + n);
        actAsBox(a.getId());

        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED");
        s = sessions.save(s);

        Membership booked = member(a, "tvns1-" + n + "@t.io", "Booked Athlete");
        Membership noShow = member(a, "tvns2-" + n + "@t.io", "No Show Athlete");
        Booking b1 = new Booking(); b1.setSessionId(s.getId()); b1.setMembershipId(booked.getId()); b1.setStatus("BOOKED");
        bookings.save(b1);
        Booking b2 = new Booking(); b2.setSessionId(s.getId()); b2.setMembershipId(noShow.getId()); b2.setStatus("NO_SHOW");
        bookings.save(b2);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.rail()).extracting(TvStateService.RailRow::name).contains("Booked Athlete");
        assertThat(st.rail()).extracting(TvStateService.RailRow::name).doesNotContain("No Show Athlete");
    }

    @Test
    void draftProgrammingHiddenFromTv() {
        long n = System.nanoTime();
        Box a = newBox("tvs-draft-" + n);
        actAsBox(a.getId());

        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("DRAFT");
        s = sessions.save(s);

        Wod fran = new Wod(); fran.setTitle("Fran"); fran.setWodType("FOR_TIME"); fran.setScoreType("TIME");
        fran.setBodyText("21-15-9"); fran = wods.save(fran);
        SessionItem it = new SessionItem();
        it.setSessionId(s.getId()); it.setSortOrder(0); it.setWodId(fran.getId()); it.setScoreable(true);
        items.save(it);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.view()).isEqualTo("CLASS");
        assertThat(st.items()).isEmpty();
    }

    @Test
    void idleWhenNothingToday() {
        long n = System.nanoTime();
        Box a = newBox("tvs-idle-" + n);
        actAsBox(a.getId());
        ClassSession s = new ClassSession();
        s.setName("Tomorrow Class"); s.setStartAt(Instant.now().plusSeconds(90_000));
        s.setDurationMin(60); s.setCapacity(12);
        sessions.save(s);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.view()).isEqualTo("IDLE");
        assertThat(st.next().name()).isEqualTo("Tomorrow Class");
    }
}
