package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * AES-GCM at rest for the box's Stripe credentials. The only place that touches the master keys.
 * <p>
 * <b>Versioned keys, because rotation has to be possible.</b> {@code BOXHUB_STRIPE_ENC_KEYS} is a
 * comma-separated list of {@code version:base64key} entries, newest first by convention (ordering is
 * cosmetic — {@link #encrypt} always picks the numerically highest version). Ciphertext is stored as
 * {@code v{n}:base64(iv||ct||tag)}, so {@link #decrypt} reads the version off the value itself and
 * selects the matching key. Rotating is therefore: generate a new key, prepend it with the next
 * version number, keep the old entry. Old rows keep decrypting; new writes use the new key. Dropping
 * an old entry is only safe once nothing is still encrypted under it.
 * <p>
 * <b>Legacy format.</b> Rows written before versioning carry no prefix. Base64 has no {@code ':'} in
 * its alphabet, so "contains a colon" is an unambiguous marker for the new format, and an unprefixed
 * value is decrypted with {@link #LEGACY_VERSION} — v1 is by definition the key that used to be the
 * single {@code BOXHUB_STRIPE_ENC_KEY}. Migrating an existing deploy is thus
 * {@code BOXHUB_STRIPE_ENC_KEYS=1:$OLD_BOXHUB_STRIPE_ENC_KEY} and nothing re-encrypts.
 */
@Service
public class CryptoService {

    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;
    /** Unprefixed (pre-versioning) ciphertext was encrypted with the key now configured as v1. */
    private static final int LEGACY_VERSION = 1;

    private final Map<Integer, SecretKeySpec> keys = new HashMap<>();
    private final int currentVersion;
    private final SecureRandom random = new SecureRandom();

    public CryptoService(@Value("${boxhub.stripe.enc-keys}") String spec) {
        for (String entry : spec.split(",")) {
            String e = entry.trim();
            if (e.isEmpty()) continue;
            int colon = e.indexOf(':');
            if (colon < 1) {
                throw new IllegalStateException("BOXHUB_STRIPE_ENC_KEYS entries must be version:base64key");
            }
            int version = parseVersion(e.substring(0, colon).trim());
            byte[] k = Base64.getDecoder().decode(e.substring(colon + 1).trim());
            // Never echo the offending value — the message goes to logs on a boot failure.
            if (k.length != 32) {
                throw new IllegalStateException("BOXHUB_STRIPE_ENC_KEYS: key v" + version + " must be 32 bytes (base64)");
            }
            // Last-win on a duplicate version would surface much later as "decrypt failed" on every
            // row encrypted under the shadowed key. Fail at boot, like every other config typo here.
            if (keys.containsKey(version)) {
                throw new IllegalStateException("BOXHUB_STRIPE_ENC_KEYS: version v" + version + " listed twice");
            }
            keys.put(version, new SecretKeySpec(k, "AES"));
        }
        if (keys.isEmpty()) {
            throw new IllegalStateException("BOXHUB_STRIPE_ENC_KEYS must list at least one version:base64key");
        }
        this.currentVersion = Collections.max(keys.keySet());
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, keys.get(currentVersion), new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return "v" + currentVersion + ":"
                    + Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (Exception e) {
            throw new IllegalStateException("encrypt failed", e); // never log plaintext
        }
    }

    public String decrypt(String stored) {
        // Version selection happens OUTSIDE the try below on purpose: an unknown key version must
        // fail with its own explicit message, not get swallowed into a generic "decrypt failed".
        int colon = stored.indexOf(':');
        int version = LEGACY_VERSION;
        String body = stored;
        if (colon > 0) {
            version = parseVersion(stored.substring(0, colon));
            body = stored.substring(colon + 1);
        }
        SecretKeySpec key = keys.get(version);
        if (key == null) {
            throw new IllegalStateException("no encryption key configured for version v" + version);
        }
        try {
            byte[] all = Base64.getDecoder().decode(body);
            byte[] iv = java.util.Arrays.copyOfRange(all, 0, IV_LEN);
            byte[] ct = java.util.Arrays.copyOfRange(all, IV_LEN, all.length);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(c.doFinal(ct), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("decrypt failed", e);
        }
    }

    /** {@code "v2"} or {@code "2"} -> 2. Throws rather than guessing — a misread version would
     *  otherwise silently select the wrong key and surface as a bogus auth-tag failure. */
    private static int parseVersion(String raw) {
        String digits = raw.startsWith("v") ? raw.substring(1) : raw;
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException e) {
            throw new IllegalStateException("unrecognised encryption key version prefix");
        }
    }
}
