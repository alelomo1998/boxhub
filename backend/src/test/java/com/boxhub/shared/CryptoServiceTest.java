package com.boxhub.shared;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// ponytail: CryptoService's constructor takes the key as a plain String, no other Spring
// dependency — plain JUnit instantiation covers it fully, no need for @SpringBootTest /
// the postgres testcontainer that AbstractIntegrationTest brings up.
class CryptoServiceTest {

    private static final String TEST_KEY = "HYjgfGYymYYLNWDjEGICrN1gXPc6SkDd8lVuYB/4vfo=";

    private final CryptoService crypto = new CryptoService(TEST_KEY);

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
        byte[] raw = java.util.Base64.getDecoder().decode(stored);
        raw[raw.length - 1] ^= 0x01; // flip a bit inside the ciphertext/tag region
        String tampered = java.util.Base64.getEncoder().encodeToString(raw);

        assertThatThrownBy(() -> crypto.decrypt(tampered))
                .isInstanceOf(IllegalStateException.class);
    }
}
