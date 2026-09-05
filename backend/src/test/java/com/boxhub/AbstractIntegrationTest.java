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
        // Same reasoning, for M11's extended limits. The global ceiling counts EVERY /api/
        // request, and the whole suite shares this one Spring context with MockMvc's default
        // remoteAddr 127.0.0.1 — so at the production default of 600/min the suite's own
        // volume would eventually trip the limiter and read as flake.
        "boxhub.rate-limit.write=100000",
        "boxhub.rate-limit.lookup=100000",
        "boxhub.rate-limit.global=100000",
        // Every secret-shaped property in application.yml is now default-less (SecretDefaultsTest
        // enforces it), so the test context has to supply all of them or placeholder resolution
        // fails at boot.
        "boxhub.jwt.secret=test-only-jwt-secret-must-be-at-least-32-bytes!",
        "boxhub.stripe.enc-keys=1:HYjgfGYymYYLNWDjEGICrN1gXPc6SkDd8lVuYB/4vfo=",
        // >=32 chars: MediaSigner enforces a 32-char floor (a short or blank link secret makes
        // every signed media URL forgeable), so this must satisfy it or no context boots.
        "boxhub.media.link-secret=test-only-media-link-secret-padded-to-32",
        // Every other job in this codebase is a 3am cron and never fires inside a test run. The class
        // reminder sweep is per-minute, so it WOULD — iterating every box the suite has ever created,
        // several times per run, and emitting CLASS_STARTING_SOON into other tests' boxes. "-" is
        // Spring's Scheduled.CRON_DISABLED. Tests drive sweepBox(boxId, now) directly.
        "boxhub.class-reminder-cron=-"
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
