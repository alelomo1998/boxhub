package com.boxhub;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

// ponytail: boxhub.auth-rate-limit relaxed here via @TestPropertySource (not
// @DynamicPropertySource) so subclasses like RateLimitTest can override it with their
// own @TestPropertySource — dynamic properties have highest precedence and would win
// over a subclass's @TestPropertySource, defeating that override. Verified empirically.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "boxhub.auth-rate-limit=1000",
        // Every secret-shaped property in application.yml is now default-less (SecretDefaultsTest
        // enforces it), so the test context has to supply all of them or placeholder resolution
        // fails at boot.
        "boxhub.jwt.secret=test-only-jwt-secret-must-be-at-least-32-bytes!",
        "boxhub.stripe.enc-keys=1:HYjgfGYymYYLNWDjEGICrN1gXPc6SkDd8lVuYB/4vfo=",
        // >=32 chars: MediaSigner enforces a 32-char floor (a short or blank link secret makes
        // every signed media URL forgeable), so this must satisfy it or no context boots.
        "boxhub.media.link-secret=test-only-media-link-secret-padded-to-32"
})
public abstract class AbstractIntegrationTest {

    // Singleton container: started once per JVM, never stopped between test classes.
    // @Testcontainers/@Container must NOT be used here — their per-class lifecycle stops
    // the container after the first class while Spring's cached context still points at it.
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }
}
