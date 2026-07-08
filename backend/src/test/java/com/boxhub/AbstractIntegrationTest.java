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
@TestPropertySource(properties = "boxhub.auth-rate-limit=1000")
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
