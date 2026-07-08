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

    @Transactional
    public String issue(User user) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(sha256(token));
        rt.setExpiresAt(Instant.now().plus(refreshTtl));
        tokens.save(rt);
        return token;
    }

    @Transactional
    public User consume(String rawToken) {
        RefreshToken rt = tokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token"));
        if (rt.getExpiresAt().isBefore(Instant.now()))
            throw new BadCredentialsException("Expired refresh token");
        tokens.delete(rt);
        return rt.getUser();
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
