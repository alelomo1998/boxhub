package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AuthSchemaTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired AuthIdentityRepository identities;
    @Autowired EmailTokenRepository emailTokens;

    private User newUser() {
        User u = new User();
        u.setEmail("schema-" + System.nanoTime() + "@t.io");
        u.setName("Schema");
        u.setPasswordHash(null); // passwordless (Google-only) users are legal now
        return users.save(u);
    }

    @Test
    void userDefaultsToUnverifiedAndUnthrottled() {
        User u = users.save(newUser());
        assertThat(u.isEmailVerified()).isFalse();
        assertThat(u.getFailedAttempts()).isZero();
        assertThat(u.getThrottledUntil()).isNull();
        assertThat(u.getPasswordHash()).isNull();
    }

    @Test
    void authIdentityIsFoundByProviderAndSubject() {
        User u = newUser();
        AuthIdentity id = new AuthIdentity();
        id.setUser(u);
        id.setProvider("google");
        id.setProviderSubject("sub-" + System.nanoTime());
        id.setEmail(u.getEmail());
        identities.save(id);

        assertThat(identities.findByProviderAndProviderSubject("google", id.getProviderSubject()))
                .isPresent()
                .get()
                .extracting(a -> a.getUser().getId())
                .isEqualTo(u.getId());
    }

    @Test
    void emailTokenIsFoundByHash() {
        User u = newUser();
        EmailToken t = new EmailToken();
        t.setUser(u);
        t.setType("VERIFY");
        t.setTokenHash("hash-" + System.nanoTime());
        t.setExpiresAt(Instant.now().plusSeconds(3600));
        emailTokens.save(t);

        assertThat(emailTokens.findByTokenHash(t.getTokenHash())).isPresent();
        assertThat(emailTokens.findByTokenHash("nope-" + UUID.randomUUID())).isEmpty();
    }
}
