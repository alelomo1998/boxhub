package com.boxhub.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

/**
 * Minimum length, and a check against Have I Been Pwned.
 *
 * No composition rules. "Must contain a symbol" produces Password1! and nothing else —
 * it optimises for a rule, not for entropy. What actually breaks accounts is credential
 * stuffing with passwords already in a breach corpus, and that is exactly what this blocks.
 *
 * k-anonymity: only the first 5 characters of the SHA-1 leave this server. HIBP returns
 * every suffix under that prefix and the comparison happens locally — the password itself
 * is never transmitted, hashed or otherwise.
 *
 * Fails OPEN. If HIBP is unreachable, signup still works. A password control that can take
 * the product down is a worse bug than the one it prevents.
 */
@Component
public class PasswordPolicy {

    private static final Logger log = LoggerFactory.getLogger(PasswordPolicy.class);
    private static final int MIN_LENGTH = 10;

    private final RestClient http = RestClient.builder()
            .baseUrl("https://api.pwnedpasswords.com")
            .requestFactory(factory())
            .build();

    public void check(String rawPassword) {
        if (rawPassword == null || rawPassword.length() < MIN_LENGTH)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_SHORT");
        if (isBreached(rawPassword))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PASSWORD_BREACHED");
    }

    private boolean isBreached(String rawPassword) {
        try {
            String sha1 = sha1(rawPassword);
            String prefix = sha1.substring(0, 5);
            String suffix = sha1.substring(5);

            String body = http.get().uri("/range/{prefix}", prefix).retrieve().body(String.class);
            if (body == null) return false;

            return body.lines().anyMatch(line -> line.startsWith(suffix));
        } catch (Exception e) {
            log.warn("HIBP unreachable, allowing password: {}", e.getMessage());
            return false; // fail open — never break signup over this
        }
    }

    private static String sha1(String value) {
        try {
            return HexFormat.of().withUpperCase()
                    .formatHex(MessageDigest.getInstance("SHA-1").digest(value.getBytes()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static org.springframework.http.client.ClientHttpRequestFactory factory() {
        var f = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        return f;
    }
}
