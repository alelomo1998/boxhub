package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

class AccountDeletionTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired AccountService accounts;
    @Autowired AuthIdentityRepository identities;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired MembershipRepository memberships;
    @Autowired BoxRepository boxes;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    // authService.register() sends a verification email; @MockitoBean fully mocks Mailer, so an
    // unstubbed mailer.link(...) returns null and the Map.of("link", null) inside it throws NPE
    // before send() is reached (same gotcha as RegistrationTest/VerificationTest).
    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    private User athleteInABox() {
        User u = authService.register("gdpr-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Real Name");
        u.setEmailVerified(true);
        u = users.save(u);

        Box b = new Box();
        b.setName("GDPR Box");
        b.setSlug("gdpr-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        boxes.save(b);

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

        accounts.anonymize(u.getId());

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getEmail()).isNotEqualTo(oldEmail);
        assertThat(after.getEmail()).endsWith("@boxhub.invalid");
        assertThat(after.getName()).isEqualTo("Deleted athlete");
        assertThat(after.getPasswordHash()).isNull();
        assertThat(identities.findByUserId(u.getId())).isEmpty();
        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();

        // The membership survives, so the box's class history and leaderboards stay whole —
        // the row simply is not attached to a person any more.
        assertThat(memberships.findByUserIdWithBox(u.getId())).hasSize(1);
    }

    @Test
    void deletionIsIdempotent() {
        User u = athleteInABox();
        accounts.anonymize(u.getId());
        String scrubbed = users.findById(u.getId()).orElseThrow().getEmail();

        accounts.anonymize(u.getId()); // must not throw, must not re-scramble

        assertThat(users.findById(u.getId()).orElseThrow().getEmail()).isEqualTo(scrubbed);
    }

    @Test
    void theOnlyAdminOfABoxCannotDeleteThemselves() {
        User owner = authService.register("owner-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Owner");
        owner.setEmailVerified(true);
        owner = users.save(owner);

        Box b = new Box();
        b.setName("Solo Box");
        b.setSlug("solo-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        boxes.save(b);

        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(b);
        m.setRole("BOX_ADMIN");
        memberships.save(m);

        final java.util.UUID id = owner.getId();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> accounts.anonymize(id))
                .hasMessageContaining("LAST_ADMIN");
    }

    @Test
    void exportContainsTheUsersOwnData() {
        User u = athleteInABox();
        var dump = accounts.export(u.getId());

        assertThat(dump).containsKeys("user", "memberships", "bookings", "scores", "lifts");
        assertThat(dump.get("user").toString()).contains(u.getEmail());
    }
}
