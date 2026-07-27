package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/**
 * Mints nginx secure_link tokens. MD5 here is a KEYED digest (secret appended, so no
 * length-extension); forgery needs the secret, not a collision. This is nginx's own mechanism —
 * see the M11 spec for the auth_request fallback if MD5 is ever ruled out.
 */
@Service
public class MediaSigner {

    public static final long EXPIRY_SECONDS = 600;

    private final String secret;

    public MediaSigner(@Value("${boxhub.media.link-secret}") String secret) {
        // The property has no default, but Spring resolves a SET-BUT-EMPTY env var happily, and
        // `BOXHUB_MEDIA_LINK_SECRET=` is the normal shape of an unset k8s/CI secret reference.
        // Without this guard that deploy boots and every media URL is forgeable under a key the
        // attacker already knows (the empty string) — the same failure shape as M10's committed
        // enc-key default, one layer below where SecretDefaultsTest looks. Minimum length matches
        // JwtConfig's 32-byte floor: this secret is the only thing standing between a guessed URL
        // and every athlete's photo.
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException("BOXHUB_MEDIA_LINK_SECRET must be set and non-blank");
        }
        if (secret.length() < 32) {
            throw new IllegalStateException("BOXHUB_MEDIA_LINK_SECRET must be at least 32 characters");
        }
        this.secret = secret;
    }

    public String sign(String path) {
        if (path == null || path.isBlank()) return path;
        long expires = Instant.now().getEpochSecond() + EXPIRY_SECONDS;
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] d = md.digest((expires + path + " " + secret).getBytes(StandardCharsets.UTF_8));
            String token = Base64.getEncoder().encodeToString(d)
                    .replace('+', '-').replace('/', '_').replace("=", "");
            return path + "?md5=" + token + "&expires=" + expires;
        } catch (Exception e) {
            throw new IllegalStateException("media sign failed", e); // never log the secret
        }
    }
}
