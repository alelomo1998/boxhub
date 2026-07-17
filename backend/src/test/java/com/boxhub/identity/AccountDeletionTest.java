package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
import com.boxhub.programming.Movement;
import com.boxhub.programming.MovementRepository;
import com.boxhub.programming.SessionItem;
import com.boxhub.programming.SessionItemRepository;
import com.boxhub.programming.Wod;
import com.boxhub.programming.WodRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

class AccountDeletionTest extends AbstractIntegrationTest {

    private static final String PASSWORD = "correct-horse-battery";

    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired AccountService accounts;
    @Autowired AuthIdentityRepository identities;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired MembershipRepository memberships;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired WodScoreRepository scores;
    @Autowired LiftEntryRepository lifts;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired MovementRepository movements;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    // authService.register() sends a verification email; @MockitoBean fully mocks Mailer, so an
    // unstubbed mailer.link(...) returns null and the Map.of("link", null) inside it throws NPE
    // before send() is reached (same gotcha as RegistrationTest/VerificationTest).
    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    @AfterEach
    void clearTenant() { SecurityContextHolder.clearContext(); }

    private Box newBox() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("GDPR Box");
        b.setSlug("gdpr-box-" + n);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private User athleteInABox() {
        User u = authService.register("gdpr-" + System.nanoTime() + "@t.io", PASSWORD, "Real Name");
        u.setEmailVerified(true);
        u = users.save(u);

        Box b = newBox();

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        memberships.save(m);
        return u;
    }

    /** Google-only account: no auth_identity row needed for this test, just a null password_hash. */
    private User googleOnlyAthlete() {
        User u = new User();
        u.setEmail("google-" + System.nanoTime() + "@t.io");
        u.setName("Google Athlete");
        u.setEmailVerified(true);
        u = users.save(u);

        Box b = newBox();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        memberships.save(m);
        return u;
    }

    @Test
    void deletionScrubsThePersonButKeepsTheirMembershipRow() {
        User u = athleteInABox();
        refreshTokens.issue(u, "phone", "1.1.1.1");
        String oldEmail = u.getEmail();

        accounts.anonymize(u.getId(), PASSWORD);

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getEmail()).isNotEqualTo(oldEmail);
        assertThat(after.getEmail()).endsWith("@boxhub.invalid");
        assertThat(after.getName()).isEqualTo("Deleted athlete");
        assertThat(after.getPasswordHash()).isNull();
        assertThat(after.getAnonymizedAt()).isNotNull();
        assertThat(identities.findByUserId(u.getId())).isEmpty();
        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();

        // The membership survives, so the box's class history and leaderboards stay whole —
        // the row simply is not attached to a person any more.
        assertThat(memberships.findByUserIdWithBox(u.getId())).hasSize(1);
    }

    @Test
    void deletionIsIdempotent() {
        User u = athleteInABox();
        accounts.anonymize(u.getId(), PASSWORD);
        User first = users.findById(u.getId()).orElseThrow();
        String scrubbed = first.getEmail();
        Instant anonymizedAt = first.getAnonymizedAt();

        accounts.anonymize(u.getId(), PASSWORD); // must not throw, must not re-scramble

        User second = users.findById(u.getId()).orElseThrow();
        assertThat(second.getEmail()).isEqualTo(scrubbed);
        assertThat(second.getAnonymizedAt()).isEqualTo(anonymizedAt);
    }

    /**
     * The old guard inferred "already deleted" from the email VALUE (endsWith @boxhub.invalid).
     * Only @Email is enforced at registration, so nothing stops a user legitimately registering
     * an address at that domain — their first, real erasure request would then match the "already
     * gone" check, return early, and scrub nothing while still answering as if it worked. This
     * test fails against that old value-based guard; it passes now that erasure is explicit state.
     */
    @Test
    void aUserWhoLegitimatelyRegisteredAtTheScrubbedDomainIsStillReallyErased() {
        User u = authService.register("spoof-" + System.nanoTime() + "@boxhub.invalid", PASSWORD, "Real Name");
        u.setEmailVerified(true);
        u = users.save(u);

        Box b = newBox();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        memberships.save(m);

        accounts.anonymize(u.getId(), PASSWORD);

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getName()).isEqualTo("Deleted athlete");
        assertThat(after.getPasswordHash()).isNull();
        assertThat(after.getAnonymizedAt()).isNotNull();
    }

    @Test
    void wrongPasswordCannotDeleteTheAccount() {
        User u = athleteInABox();
        String oldEmail = u.getEmail();

        // A wrong password in the request body is a field-validation failure, not a dead
        // session — 422 WRONG_PASSWORD, never 401 (see AccountService.anonymize).
        assertThatThrownBy(() -> accounts.anonymize(u.getId(), "not-the-password"))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("WRONG_PASSWORD");

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getEmail()).isEqualTo(oldEmail);
        assertThat(after.getAnonymizedAt()).isNull();
    }

    @Test
    void noPasswordSuppliedCannotDeleteTheAccount() {
        User u = athleteInABox();
        String oldEmail = u.getEmail();

        assertThatThrownBy(() -> accounts.anonymize(u.getId(), null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("WRONG_PASSWORD");

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getEmail()).isEqualTo(oldEmail);
        assertThat(after.getAnonymizedAt()).isNull();
    }

    @Test
    void googleOnlyUserIsNotLockedOutOfErasure() {
        User u = googleOnlyAthlete();

        accounts.anonymize(u.getId(), null); // no password to check — must not be blocked

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getName()).isEqualTo("Deleted athlete");
        assertThat(after.getAnonymizedAt()).isNotNull();
    }

    @Test
    void theOnlyAdminOfABoxCannotDeleteThemselves() {
        User owner = authService.register("owner-" + System.nanoTime() + "@t.io", PASSWORD, "Owner");
        owner.setEmailVerified(true);
        owner = users.save(owner);

        Box b = newBox();

        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(b);
        m.setRole("BOX_ADMIN");
        memberships.save(m);

        final UUID id = owner.getId();
        assertThatThrownBy(() -> accounts.anonymize(id, PASSWORD))
                .hasMessageContaining("LAST_ADMIN");
    }

    @Test
    void exportContainsTheUsersOwnData() {
        User u = athleteInABox();
        var dump = accounts.export(u.getId());

        assertThat(dump).containsKeys("user", "memberships", "bookings", "scores", "lifts");
        assertThat(dump.get("user").toString()).contains(u.getEmail());
    }

    /**
     * The headline guarantee — scores/bookings/lifts stay — proven, not just code-reviewed.
     */
    @Test
    void anonymizationLeavesBookingsScoresAndLiftsIntact() {
        User u = authService.register("gdpr-hist-" + System.nanoTime() + "@t.io", PASSWORD, "Real Name");
        u.setEmailVerified(true);
        u = users.save(u);

        Box b = newBox();
        actAsBox(b.getId());

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();

        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        s.setProgrammingStatus("PUBLISHED");
        sessions.save(s);

        Booking booking = new Booking();
        booking.setSessionId(s.getId());
        booking.setMembershipId(membershipId);
        booking.setStatus("BOOKED");
        UUID bookingId = bookings.save(booking).getId();

        Wod w = new Wod();
        w.setTitle("Fran");
        w.setWodType("FOR_TIME");
        w.setScoreType("TIME");
        wods.save(w);
        SessionItem item = new SessionItem();
        item.setSessionId(s.getId());
        item.setWodId(w.getId());
        item.setSortOrder(0);
        item.setScoreable(true);
        items.save(item);

        WodScore score = new WodScore();
        score.setSessionItemId(item.getId());
        score.setMembershipId(membershipId);
        score.setTimeSeconds(180);
        UUID scoreId = scores.save(score).getId();

        Movement mv = new Movement();
        mv.setBoxId(b.getId());
        mv.setName("Back Squat " + System.nanoTime());
        mv.setCategory("BARBELL");
        movements.save(mv);
        LiftEntry lift = new LiftEntry();
        lift.setMembershipId(membershipId);
        lift.setMovementId(mv.getId());
        lift.setLoad(new BigDecimal("120.5"));
        lift.setPerformedOn(LocalDate.now());
        UUID liftId = lifts.save(lift).getId();

        accounts.anonymize(u.getId(), PASSWORD);

        assertThat(bookings.findById(bookingId)).isPresent();
        assertThat(scores.findById(scoreId)).isPresent();
        assertThat(lifts.findById(liftId)).isPresent();
    }
}
