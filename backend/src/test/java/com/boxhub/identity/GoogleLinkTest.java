package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

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
    void concurrentResolveForTheSameNewUserBothWinNoOneErrors() throws Exception {
        // Real double-click: two threads call resolve() for the same brand-new subject/email
        // at the same instant, against real Postgres. Both pass the "not known yet" check,
        // then race the unique constraint. The loser must recover, not bounce to /login?error.
        // Looped with fresh subject/email each iteration because the race is timing-dependent —
        // a single shot can miss it depending on how the barrier release interleaves with the
        // two connections' commits.
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 5; i++) {
                String s = sub();
                String e = email();
                CyclicBarrier barrier = new CyclicBarrier(2);

                Callable<User> attempt = () -> {
                    barrier.await();
                    return google.resolve(s, e, true, "Double Click");
                };

                List<Future<User>> futures = List.of(pool.submit(attempt), pool.submit(attempt));
                List<User> results = futures.stream().map(f -> {
                    try {
                        return f.get();
                    } catch (Exception ex) {
                        throw new RuntimeException(ex);
                    }
                }).collect(Collectors.toList());

                User first = results.get(0);
                User second = results.get(1);
                assertThat(second.getId()).isEqualTo(first.getId());
                assertThat(identities.findByUserId(first.getId())).hasSize(1);
                assertThat(users.findByEmail(e)).isPresent();
            }
        } finally {
            pool.shutdown();
        }
    }

    @Test
    void googleMustVouchForTheAddress() {
        assertThatThrownBy(() -> google.resolve(sub(), email(), false, "Unvouched"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("GOOGLE_EMAIL_UNVERIFIED");
    }
}
