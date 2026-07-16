package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.BadCredentialsException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RefreshFamilyTest extends AbstractIntegrationTest {

    @Autowired RefreshTokenService refreshTokens;
    @Autowired RefreshTokenRepository repo;
    @Autowired AuthService authService;

    private User user() {
        return authService.register("fam-" + System.nanoTime() + "@t.io", "password1234", "Fam");
    }

    @Test
    void rotationKeepsTheFamilyAndInvalidatesTheOldToken() {
        User u = user();
        String first = refreshTokens.issue(u, "agent", "1.2.3.4");
        var rotated = refreshTokens.rotate(first, "agent", "1.2.3.4");

        assertThat(rotated.user().getId()).isEqualTo(u.getId());
        assertThat(rotated.rawToken()).isNotEqualTo(first);

        var oldRow = repo.findByTokenHash(RefreshTokenService.sha256(first)).orElseThrow();
        var newRow = repo.findByTokenHash(RefreshTokenService.sha256(rotated.rawToken())).orElseThrow();
        assertThat(oldRow.getConsumedAt()).isNotNull();
        assertThat(newRow.getFamilyId()).isEqualTo(oldRow.getFamilyId());
    }

    @Test
    void replayingAConsumedTokenRevokesTheWholeFamily() {
        User u = user();
        String stolen = refreshTokens.issue(u, "agent", "1.2.3.4");
        var live = refreshTokens.rotate(stolen, "agent", "1.2.3.4"); // victim rotates; `stolen` is now consumed

        // The thief replays the token they captured.
        assertThatThrownBy(() -> refreshTokens.rotate(stolen, "thief", "9.9.9.9"))
                .isInstanceOf(BadCredentialsException.class);

        // Both thief AND victim are locked out: the family is dead.
        assertThatThrownBy(() -> refreshTokens.rotate(live.rawToken(), "agent", "1.2.3.4"))
                .isInstanceOf(BadCredentialsException.class);
        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();
    }

    @Test
    void revokeAllKillsEveryFamily() {
        User u = user();
        refreshTokens.issue(u, "phone", "1.1.1.1");
        refreshTokens.issue(u, "laptop", "2.2.2.2");
        assertThat(refreshTokens.activeSessions(u.getId())).hasSize(2);

        refreshTokens.revokeAllFor(u.getId());

        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();
    }

    @Test
    void activeSessionsExposeDeviceAndIp() {
        User u = user();
        refreshTokens.issue(u, "Firefox on Linux", "5.6.7.8");
        var sessions = refreshTokens.activeSessions(u.getId());
        assertThat(sessions).singleElement()
                .satisfies(s -> {
                    assertThat(s.getUserAgent()).isEqualTo("Firefox on Linux");
                    assertThat(s.getIp()).isEqualTo("5.6.7.8");
                });
    }
}
