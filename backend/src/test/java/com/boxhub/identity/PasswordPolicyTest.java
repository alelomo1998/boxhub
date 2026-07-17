package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordPolicyTest extends AbstractIntegrationTest {

    @Autowired PasswordPolicy policy;

    @Test
    void tooShortIsRejected() {
        assertThatThrownBy(() -> policy.check("short1234"))  // 9 chars
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("PASSWORD_TOO_SHORT");
    }

    @Test
    void aKnownBreachedPasswordIsRejected() {
        // "password123" appears in every breach corpus ever assembled.
        assertThatThrownBy(() -> policy.check("password123"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("PASSWORD_BREACHED");
    }

    @Test
    void aStrongUnbreachedPasswordPasses() {
        assertThatCode(() -> policy.check("kettlebell-thunder-" + System.nanoTime()))
                .doesNotThrowAnyException();
    }
}
