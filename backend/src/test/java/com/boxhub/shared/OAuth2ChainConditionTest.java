package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the boot-crash bug: BOXHUB_GOOGLE_CLIENT_ID exported as a blank placeholder must keep
 * the Google chain off, same as leaving it unset entirely (which every other test class already
 * exercises implicitly — none of them export the var, and they all boot fine).
 */
@TestPropertySource(properties = "BOXHUB_GOOGLE_CLIENT_ID=")
class OAuth2ChainConditionTest extends AbstractIntegrationTest {

    @Autowired ApplicationContext context;

    @Test
    void blankClientIdKeepsTheGoogleChainOff() {
        assertThat(context.containsBean("googleChain")).isFalse();
    }
}
