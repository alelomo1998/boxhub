package com.boxhub.identity;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.NoSuchElementException;

@Service
public class EmailTokenService {

    public static final String VERIFY = "VERIFY";
    public static final String RESET = "RESET";
    public static final String EMAIL_CHANGE = "EMAIL_CHANGE";

    public static final Duration VERIFY_TTL = Duration.ofHours(24);
    public static final Duration RESET_TTL = Duration.ofHours(1);
    public static final Duration CHANGE_TTL = Duration.ofHours(24);

    private final EmailTokenRepository tokens;
    private final SecureRandom random = new SecureRandom();

    public EmailTokenService(EmailTokenRepository tokens) {
        this.tokens = tokens;
    }

    /** Issuing a new token of a type invalidates any earlier unconsumed one of that type. */
    @Transactional
    public String issue(User user, String type, String newEmail, Duration ttl) {
        tokens.deleteUnconsumedOfType(user.getId(), type);
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        EmailToken t = new EmailToken();
        t.setUser(user);
        t.setType(type);
        t.setTokenHash(RefreshTokenService.sha256(token));
        t.setNewEmail(newEmail);
        t.setExpiresAt(Instant.now().plus(ttl));
        tokens.save(t);
        return token;
    }

    @Transactional
    public EmailToken consume(String rawToken, String expectedType) {
        EmailToken t = tokens.findByTokenHash(RefreshTokenService.sha256(rawToken))
                .orElseThrow(NoSuchElementException::new);
        if (!t.getType().equals(expectedType) || t.getConsumedAt() != null
                || t.getExpiresAt().isBefore(Instant.now()))
            throw new ResponseStatusException(HttpStatus.GONE, "Link expired or already used");
        t.setConsumedAt(Instant.now());
        return t;
    }
}
