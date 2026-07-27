package com.boxhub.shared;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// ponytail: CryptoService's constructor takes the key spec as a plain String, no other Spring
// dependency — plain JUnit instantiation covers it fully, no need for @SpringBootTest /
// the postgres testcontainer that AbstractIntegrationTest brings up.
class CryptoServiceTest {

    private static final String KEY_V1 = "HYjgfGYymYYLNWDjEGICrN1gXPc6SkDd8lVuYB/4vfo=";
    private static final String KEY_V2 = "chj7ygIWFuZQX9Zw/bmrXrrPdxdQAbZ9/44ob+HNEm8=";

    private final CryptoService crypto = new CryptoService("1:" + KEY_V1);

    @Test
    void roundTrip() {
        String plaintext = "sk_test_restrictedkeyvalue12345";
        String stored = crypto.encrypt(plaintext);
        assertThat(crypto.decrypt(stored)).isEqualTo(plaintext);
    }

    @Test
    void twoEncryptionsOfSamePlaintextDiffer() {
        String plaintext = "whsec_sameSecretEveryTime";
        String a = crypto.encrypt(plaintext);
        String b = crypto.encrypt(plaintext);
        assertThat(a).isNotEqualTo(b); // random IV per call
        assertThat(crypto.decrypt(a)).isEqualTo(plaintext);
        assertThat(crypto.decrypt(b)).isEqualTo(plaintext);
    }

    @Test
    void tamperedCiphertextFailsAuthTag() {
        String stored = crypto.encrypt("sk_test_dontTamperWithMe");
        byte[] raw = java.util.Base64.getDecoder().decode(stripVersion(stored));
        raw[raw.length - 1] ^= 0x01; // flip a bit inside the ciphertext/tag region
        String tampered = "v1:" + java.util.Base64.getEncoder().encodeToString(raw);

        assertThatThrownBy(() -> crypto.decrypt(tampered))
                .isInstanceOf(IllegalStateException.class);
    }

    // --- key versioning: rotation must be possible without orphaning stored credentials ----------

    @Test
    void encryptUsesTheHighestVersionRegardlessOfListOrder() {
        // Deliberately oldest-first: "newest first" is only a documentation convention — the code
        // must pick the numerically highest version, so a sloppily-ordered env var cannot silently
        // keep encrypting under the key the operator was trying to rotate away from.
        CryptoService rotated = new CryptoService("1:" + KEY_V1 + ",2:" + KEY_V2);

        String stored = rotated.encrypt("rk_live_afterRotation");

        assertThat(stored).startsWith("v2:");
        assertThat(rotated.decrypt(stored)).isEqualTo("rk_live_afterRotation");
    }

    @Test
    void valueEncryptedUnderV1StillDecryptsAfterV2IsIntroduced() {
        String storedUnderV1 = crypto.encrypt("whsec_writtenBeforeRotation");
        assertThat(storedUnderV1).startsWith("v1:");

        CryptoService rotated = new CryptoService("2:" + KEY_V2 + ",1:" + KEY_V1);

        assertThat(rotated.decrypt(storedUnderV1)).isEqualTo("whsec_writtenBeforeRotation");
    }

    @Test
    void legacyUnprefixedValueStillDecryptsUnderV1() {
        // Exactly what M10 wrote into box_stripe: bare base64(iv||ct||tag), no version prefix. If
        // this regresses, every connected box's Stripe credentials become undecryptable on deploy.
        String legacy = stripVersion(crypto.encrypt("rk_test_writtenByM10"));
        assertThat(legacy).doesNotContain(":");

        CryptoService rotated = new CryptoService("2:" + KEY_V2 + ",1:" + KEY_V1);

        assertThat(rotated.decrypt(legacy)).isEqualTo("rk_test_writtenByM10");
    }

    @Test
    void unknownVersionFailsCleanlyInsteadOfReturningGarbage() {
        String claimsV9 = "v9:" + stripVersion(crypto.encrypt("whsec_underAKeyWeDoNotHave"));

        assertThatThrownBy(() -> crypto.decrypt(claimsV9))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("v9");
    }

    @Test
    void nonNumericVersionPrefixIsRejected() {
        assertThatThrownBy(() -> crypto.decrypt("vNaN:AAAAAAAAAAAAAAAAAAAA"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("version prefix");
    }

    @Test
    void bootFailsOnAnEmptyOrMalformedKeySpec() {
        assertThatThrownBy(() -> new CryptoService(""))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new CryptoService(KEY_V1)) // no version prefix
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new CryptoService("1:dG9vU2hvcnQ=")) // 8 bytes, not 32
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32 bytes");
    }

    private static String stripVersion(String stored) {
        return stored.substring(stored.indexOf(':') + 1);
    }
}
