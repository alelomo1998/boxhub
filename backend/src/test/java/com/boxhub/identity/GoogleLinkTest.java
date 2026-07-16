package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleLinkTest extends AbstractIntegrationTest {

    @Autowired GoogleLinkService google;
    @Autowired UserRepository users;
    @Autowired AuthIdentityRepository identities;
    @Autowired AuthService authService;
    @Autowired PasswordEncoder encoder;

    private String email() { return "google-" + System.nanoTime() + "@t.io"; }
    private String sub() { return "sub-" + System.nanoTime(); }

    @Test
    void unknownEmailCreatesAVerifiedPasswordlessUser() {
        String e = email();
        User u = google.resolve(sub(), e, true, "New Person");

        assertThat(u.getEmail()).isEqualTo(e);
        assertThat(u.isEmailVerified()).isTrue();
        assertThat(u.getPasswordHash()).isNull();
        assertThat(identities.findByUserId(u.getId())).hasSize(1);
    }

    @Test
    void anAlreadyLinkedIdentitySignsStraightIn() {
        String s = sub();
        User first = google.resolve(s, email(), true, "Repeat");
        User second = google.resolve(s, first.getEmail(), true, "Repeat");

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(identities.findByUserId(first.getId())).hasSize(1);
    }

    @Test
    void aVERIFIEDLocalAccountGetsLinkedAndKeepsItsPassword() {
        User local = authService.register(email(), "correct-horse-battery", "Verified Local");
        local.setEmailVerified(true);
        users.save(local);

        User u = google.resolve(sub(), local.getEmail(), true, "Verified Local");

        assertThat(u.getId()).isEqualTo(local.getId());
        // The same human, proven twice — nothing is destroyed.
        assertThat(u.getPasswordHash()).isNotNull();
        assertThat(identities.findByUserId(u.getId())).hasSize(1);
    }

    @Test
    void anUNVERIFIEDLocalAccountLosesItsPasswordToGoogle() {
        // The attack: an attacker pre-registers victim@gmail.com with a password they know
        // and never verifies it, waiting for the real owner to sign in with Google.
        User squatted = authService.register(email(), "attacker-knows-this", "Impostor");
        assertThat(squatted.isEmailVerified()).isFalse();

        User u = google.resolve(sub(), squatted.getEmail(), true, "Real Owner");

        assertThat(u.getId()).isEqualTo(squatted.getId());
        assertThat(u.isEmailVerified()).isTrue();
        // The attacker's password is gone. They can only get one back through the real inbox.
        assertThat(u.getPasswordHash()).isNull();
    }

    @Test
    void resolveIsIdempotentForTheSameNewUserCalledTwice() {
        // Pins the DataIntegrityViolationException recovery path in GoogleLinkService.resolve():
        // a double-click sends two resolve() calls for the same brand-new user. Sequential calls
        // can't reproduce the actual unique-constraint race (that needs real concurrency, not
        // deterministic in a unit test) but they exercise the same postcondition the recovery
        // path guarantees — one user, one identity row, no matter how many times it's called.
        String s = sub();
        String e = email();
        User first = google.resolve(s, e, true, "Double Click");
        User second = google.resolve(s, e, true, "Double Click");

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(identities.findByUserId(first.getId())).hasSize(1);
    }

    @Test
    void googleMustVouchForTheAddress() {
        assertThatThrownBy(() -> google.resolve(sub(), email(), false, "Unvouched"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("GOOGLE_EMAIL_UNVERIFIED");
    }
}
