package com.boxhub.shared;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// ponytail: MediaSigner's constructor takes the secret as a plain String, no other Spring
// dependency — plain JUnit instantiation covers it fully (mirrors CryptoServiceTest), no need
// for @SpringBootTest / the postgres testcontainer that AbstractIntegrationTest brings up.
class MediaSignerTest {

    private static final String SECRET = "test-media-link-secret-do-not-use-in-prod";
    private static final Pattern QS = Pattern.compile("\\?md5=([^&]+)&expires=(\\d+)$");

    private final MediaSigner signer = new MediaSigner(SECRET);

    @Test
    void aBlankOrShortSecretFailsFastAtConstruction() {
        // boxhub.media.link-secret has no config default, but Spring resolves a SET-BUT-EMPTY env
        // var happily and `BOXHUB_MEDIA_LINK_SECRET=` is the normal shape of an unset k8s/CI secret
        // reference. Without these guards that deploy boots and every media URL is forgeable under
        // the empty string — the same failure shape as M10's committed enc-key default, one layer
        // below where SecretDefaultsTest can see.
        assertThatThrownBy(() -> new MediaSigner("")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new MediaSigner("   ")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new MediaSigner(null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new MediaSigner("too-short-to-be-a-real-secret"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void signedUrlContainsMd5AndExpires() {
        String signed = signer.sign("/media/box1/a.jpg");
        Matcher m = QS.matcher(signed);
        assertThat(m.find()).isTrue();
        assertThat(m.group(1)).isNotBlank();
        assertThat(Long.parseLong(m.group(2))).isGreaterThan(Instant.now().getEpochSecond());
    }

    @Test
    void nullAndBlankPathsPassThroughUnsigned() {
        assertThat(signer.sign(null)).isNull();
        assertThat(signer.sign("")).isEmpty();
    }

    @Test
    void expiryWindowMovesAcrossCalls() throws InterruptedException {
        String first = signer.sign("/media/box1/a.jpg");
        Thread.sleep(1100); // cross a whole-second boundary — expires is epoch-seconds
        String second = signer.sign("/media/box1/a.jpg");
        assertThat(first).isNotEqualTo(second);
    }

    /**
     * Pins the exact digest construction to nginx's secure_link_md5 formula:
     * md5(expires + uri + " " + secret), base64, then +/ -> -_ with = stripped. If this drifts
     * from nginx's own algorithm, every signed image 403s in production and no unit test would
     * otherwise catch it — nginx does the actual validation, not Java.
     */
    @Test
    void digestMatchesNginxSecureLinkConstructionExactly() throws Exception {
        String path = "/media/box1/a.jpg";
        String signed = signer.sign(path);
        Matcher m = QS.matcher(signed);
        assertThat(m.find()).isTrue();
        String md5 = m.group(1);
        long expires = Long.parseLong(m.group(2));

        assertThat(md5).isEqualTo(nginxDigest(expires + path + " " + SECRET));
        assertThat(md5).doesNotContain("+", "/", "="); // base64url, padding stripped
    }

    @Test
    void unsignedUrlIsDenied() {
        // no token at all -> nginx's $secure_link resolves to "" (403). An empty candidate can
        // never equal a real keyed digest.
        assertThat(nginxWouldAccept("/media/box1/a.jpg", "", Instant.now().getEpochSecond() + 600,
                Instant.now().getEpochSecond())).isFalse();
    }

    @Test
    void expiredSignatureIsDenied() throws Exception {
        String path = "/media/box1/a.jpg";
        long expires = Instant.now().getEpochSecond() - 10; // already elapsed
        String md5 = nginxDigest(expires + path + " " + SECRET);
        // digest is correct for this (path, expires) pair, but expires is in the past -> 410
        assertThat(nginxWouldAccept(path, md5, expires, Instant.now().getEpochSecond())).isFalse();
    }

    @Test
    void signatureForDifferentPathDoesNotValidate() {
        String signed = signer.sign("/media/box1/a.jpg");
        Matcher m = QS.matcher(signed);
        assertThat(m.find()).isTrue();
        String md5 = m.group(1);
        long expires = Long.parseLong(m.group(2));

        assertThat(nginxWouldAccept("/media/box1/OTHER.jpg", md5, expires, Instant.now().getEpochSecond()))
                .isFalse();
    }

    /**
     * Reproduces nginx's secure_link decision (module lives in nginx, not Java): accept iff the
     * digest matches AND expires hasn't passed. Used only to prove denial paths against the real
     * algorithm, not as production logic.
     */
    private boolean nginxWouldAccept(String uri, String md5, long expires, long nowEpoch) {
        if (nowEpoch > expires) return false;
        try {
            return nginxDigest(expires + uri + " " + SECRET).equals(md5);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String nginxDigest(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        byte[] d = md.digest(input.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(d).replace('+', '-').replace('/', '_').replace("=", "");
    }
}
