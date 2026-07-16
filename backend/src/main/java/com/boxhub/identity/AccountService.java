package com.boxhub.identity;

import com.boxhub.shared.Mailer;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AccountService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final PasswordPolicy policy;
    private final EmailTokenService emailTokens;
    private final RefreshTokenService refreshTokens;
    private final Mailer mailer;

    public AccountService(UserRepository users, PasswordEncoder encoder, PasswordPolicy policy,
                          EmailTokenService emailTokens, RefreshTokenService refreshTokens, Mailer mailer) {
        this.users = users;
        this.encoder = encoder;
        this.policy = policy;
        this.emailTokens = emailTokens;
        this.refreshTokens = refreshTokens;
        this.mailer = mailer;
    }

    public record SessionDto(UUID id, String device, String ip, Instant lastSeen, boolean current) {}

    @Transactional
    public User changePassword(UUID userId, String current, String next) {
        User u = users.findById(userId).orElseThrow();
        requirePassword(u, current);
        policy.check(next);
        u.setPasswordHash(encoder.encode(next));
        return users.save(u);
    }

    /**
     * The change lands only when the NEW address confirms it. Anyone can type an address
     * they do not own; only its owner can click the link sent to it.
     */
    @Transactional
    public void startEmailChange(UUID userId, String password, String newEmail) {
        User u = users.findById(userId).orElseThrow();
        requirePassword(u, password);

        String normalized = newEmail.toLowerCase().trim();
        if (users.findByEmail(normalized).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN");

        String token = emailTokens.issue(u, EmailTokenService.EMAIL_CHANGE, normalized,
                EmailTokenService.CHANGE_TTL);
        mailer.send(normalized, "Confirm your new email address", "email-change",
                Map.of("name", u.getName(), "link", mailer.link("/account/email?token=" + token)));
    }

    @Transactional
    public User completeEmailChange(String rawToken) {
        EmailToken t = emailTokens.consume(rawToken, EmailTokenService.EMAIL_CHANGE);
        User u = t.getUser();
        if (users.findByEmail(t.getNewEmail()).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN"); // taken while the link sat in an inbox
        u.setEmail(t.getNewEmail());
        u.setEmailVerified(true);
        try {
            // saveAndFlush so a unique-constraint hit surfaces HERE, inside this try, rather
            // than being deferred to commit (past that point we can no longer catch it) —
            // same precedent as AuthService.register / GoogleLinkService. The pre-check above
            // is just the fast path with a clean error; this is the real backstop for the
            // remaining race (another change to the same address landing between the check
            // and the write).
            return users.saveAndFlush(u);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN");
        }
    }

    /**
     * rawRefreshToken is the caller's own bh_rt cookie value (null for bearer-header callers).
     * Hashing it and comparing to each session's stored hash tells the sessions screen which
     * row is "this device" without ever exposing a token — the hash comparison never needs,
     * and never reveals, the raw value of anyone else's token.
     */
    @Transactional(readOnly = true)
    public List<SessionDto> sessions(UUID userId, String rawRefreshToken) {
        String callerHash = rawRefreshToken == null ? null : RefreshTokenService.sha256(rawRefreshToken);
        return refreshTokens.activeSessions(userId).stream()
                .map(t -> new SessionDto(t.getId(), t.getUserAgent(), t.getIp(), t.getLastUsedAt(),
                        callerHash != null && callerHash.equals(t.getTokenHash())))
                .toList();
    }

    /** A passwordless (Google-only) user must set one via the reset flow before doing either of these. */
    private void requirePassword(User u, String raw) {
        if (u.getPasswordHash() == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "NO_PASSWORD_SET");
        if (!encoder.matches(raw, u.getPasswordHash()))
            throw new BadCredentialsException("Bad credentials");
    }
}
