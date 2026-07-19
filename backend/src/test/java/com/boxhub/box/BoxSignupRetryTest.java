package com.boxhub.box;

import com.boxhub.identity.AuthService;
import com.boxhub.identity.PasswordPolicy;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Pins the retry BOUND in BoxSignupService.signup(): a slug-collision DIVE with no competing
 * email owner retries with a recomputed slug, but never unbounded — after three attempts the
 * caller gets an honest 503 SIGNUP_RETRY, not an unhandled 500. Forcing a genuine 3-way slug
 * race against Postgres is impractical in an integration test, so this is a plain Mockito unit
 * test over the orchestration logic (the transactional behaviour itself is integration-tested
 * in BoxSignupTest's concurrency cases).
 */
class BoxSignupRetryTest {

    @Test
    void slugCollisionsRetryBoundedThenAnswer503() {
        AuthService authService = mock(AuthService.class);
        UserRepository users = mock(UserRepository.class);
        BoxRepository boxes = mock(BoxRepository.class);
        BoxWaitlistRepository waitlist = mock(BoxWaitlistRepository.class);
        PlatformSettings settings = mock(PlatformSettings.class);
        PasswordPolicy policy = mock(PasswordPolicy.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        BoxSignupTx tx = mock(BoxSignupTx.class);

        when(settings.signupMode()).thenReturn("APPROVAL");
        when(settings.maxBoxes()).thenReturn(100);
        when(boxes.countByStatusIn(List.of("ACTIVE", "PENDING"))).thenReturn(0L);
        when(boxes.existsBySlug(anyString())).thenReturn(false);
        when(encoder.encode(anyString())).thenReturn("hash");
        // every attempt collides, and the email never resolves — the pathological pure-slug race
        when(tx.createOwnerAndBox(any(), any(), any(), any(), any(), any()))
                .thenThrow(new DataIntegrityViolationException("boxes_slug_key"));
        when(users.findByEmail(anyString())).thenReturn(Optional.empty());

        BoxSignupService service = new BoxSignupService(
                authService, users, boxes, waitlist, settings, policy, encoder, tx);

        assertThatThrownBy(() -> service.signup("Iron Temple", "Owner", "o@t.io", "correct-horse-battery"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("SIGNUP_RETRY");

        verify(tx, times(3)).createOwnerAndBox(any(), any(), any(), any(), any(), any());
        verify(authService, never()).sendVerification(any());
    }

    @Test
    void aCollisionThatTurnsOutToBeTheEmailRecoversAsTakenWithoutRetrying() {
        AuthService authService = mock(AuthService.class);
        UserRepository users = mock(UserRepository.class);
        BoxRepository boxes = mock(BoxRepository.class);
        BoxWaitlistRepository waitlist = mock(BoxWaitlistRepository.class);
        PlatformSettings settings = mock(PlatformSettings.class);
        PasswordPolicy policy = mock(PasswordPolicy.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        BoxSignupTx tx = mock(BoxSignupTx.class);

        when(settings.signupMode()).thenReturn("APPROVAL");
        when(settings.maxBoxes()).thenReturn(100);
        when(boxes.countByStatusIn(List.of("ACTIVE", "PENDING"))).thenReturn(0L);
        when(boxes.existsBySlug(anyString())).thenReturn(false);
        when(encoder.encode(anyString())).thenReturn("hash");
        when(tx.createOwnerAndBox(any(), any(), any(), any(), any(), any()))
                .thenThrow(new DataIntegrityViolationException("users_email_key"));
        var owner = new com.boxhub.identity.User();
        when(users.findByEmail("o@t.io")).thenReturn(Optional.of(owner));

        BoxSignupService service = new BoxSignupService(
                authService, users, boxes, waitlist, settings, policy, encoder, tx);

        var outcome = service.signup("Iron Temple", "Owner", "o@t.io", "correct-horse-battery");

        assertThat(outcome.full()).isFalse();
        verify(tx, times(1)).createOwnerAndBox(any(), any(), any(), any(), any(), any());
        verify(authService).notifyTakenEmailAttempt(owner);
        verify(authService, never()).sendVerification(any());
    }
}
