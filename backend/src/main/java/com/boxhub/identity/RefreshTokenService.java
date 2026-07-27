package com.boxhub.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository tokens;
    private final Duration refreshTtl;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokens,
                               @Value("${boxhub.jwt.refresh-ttl}") Duration refreshTtl) {
        this.tokens = tokens;
        this.refreshTtl = refreshTtl;
    }

    public record Rotated(User user, String rawToken) {}

    /** A fresh login: a brand-new family. */
    @Transactional
    public String issue(User user, String userAgent, String ip) {
        return mint(user, UUID.randomUUID(), userAgent, ip);
    }

    /**
     * Rotate within the family. A token that was already consumed is evidence of theft:
     * whoever replayed it is not the only holder, so the entire family dies and both the
     * thief and the victim must re-authenticate.
     */
    // noRollbackFor: the reuse-detected branch calls revokeFamily() then throws
    // BadCredentialsException on purpose — the throw must not undo the revocation.
    @Transactional(noRollbackFor = BadCredentialsException.class)
    public Rotated rotate(String rawToken, String userAgent, String ip) {
        RefreshToken rt = tokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token"));

        if (rt.getConsumedAt() != null) {
            tokens.revokeFamily(rt.getFamilyId(), Instant.now());
            throw new BadCredentialsException("Refresh token reuse detected");
        }
        if (rt.getRevokedAt() != null) throw new BadCredentialsException("Revoked refresh token");
        if (rt.getExpiresAt().isBefore(Instant.now())) throw new BadCredentialsException("Expired refresh token");

        Instant now = Instant.now();
        rt.setConsumedAt(now);
        rt.setLastUsedAt(now);
        User user = rt.getUser(); // EAGER: needed outside this transaction for token minting
        return new Rotated(user, mint(user, rt.getFamilyId(), userAgent, ip));
    }

    @Transactional
    public void revokeFamilyOf(String rawToken) {
        tokens.findByTokenHash(sha256(rawToken))
                .ifPresent(rt -> tokens.revokeFamily(rt.getFamilyId(), Instant.now()));
    }

    @Transactional
    public void revokeAllFor(UUID userId) {
        tokens.revokeAllForUser(userId, Instant.now());
    }

    /**
     * Per-session kill ("I lost my phone"): revokes ONE family, not every family for the user —
     * that distinction is the whole point versus revokeAllFor/logout-all.
     *
     * Ownership is checked BEFORE the write, and the check is existence-scoped to (familyId,
     * userId) together: a family that exists but belongs to someone else must look identical,
     * from the caller's side, to a family that does not exist at all. Throwing here (mapped to
     * 404 by ApiExceptionHandler) rather than AccessDeniedException (403) is deliberate — a 403
     * would confirm the id exists, which is an existence oracle over other users' session ids.
     */
    @Transactional
    public void revokeSession(UUID userId, UUID familyId) {
        if (!tokens.existsByFamilyIdAndUserId(familyId, userId))
            throw new java.util.NoSuchElementException("No such session");
        tokens.revokeFamily(familyId, Instant.now());
    }

    @Transactional(readOnly = true)
    public List<RefreshToken> activeSessions(UUID userId) {
        return tokens.findActiveByUser(userId, Instant.now());
    }

    private String mint(User user, UUID familyId, String userAgent, String ip) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant now = Instant.now();
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setFamilyId(familyId);
        rt.setTokenHash(sha256(token));
        rt.setExpiresAt(now.plus(refreshTtl));
        rt.setUserAgent(userAgent);
        rt.setIp(ip);
        rt.setLastUsedAt(now);
        tokens.save(rt);
        return token;
    }

    public static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
