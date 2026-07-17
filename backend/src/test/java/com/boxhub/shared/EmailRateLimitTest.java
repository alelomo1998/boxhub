package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Per-email bucket in AuthRateLimitFilter, distinct from the per-IP bucket RateLimitTest
 * covers. Every address here is nanoTime-unique — the email bucket has a 1h Caffeine window
 * and the filter is a singleton in the shared Spring context, so reusing an address across
 * tests (or classes) would cross-contaminate counts.
 */
class EmailRateLimitTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @MockitoBean Mailer mailer;

    // Same T5/T6 gotcha as VerificationTest/PasswordResetTest: @MockitoBean fully mocks
    // Mailer, so an unstubbed mailer.link(...) returns null and Map.of("link", null) NPEs
    // before send() is reached.
    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    private void forgot(String email, ResultMatcher expected) throws Exception {
        mvc.perform(post("/api/auth/password/forgot").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s"}
                        """.formatted(email)))
                .andExpect(expected);
    }

    @Test
    void fourthForgotForSameAddressIs429() throws Exception {
        String email = "cap-" + System.nanoTime() + "@x.io";
        for (int i = 0; i < 3; i++) {
            forgot(email, status().isAccepted());
        }
        mvc.perform(post("/api/auth/password/forgot").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s"}
                        """.formatted(email)))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @Test
    void caseFlipSharesTheSameBucket() throws Exception {
        String email = "bomb-" + System.nanoTime() + "@x.io";
        for (int i = 0; i < 3; i++) {
            forgot(email, status().isAccepted());
        }
        // same address, flipped case — must land in the same bucket, not a fresh one
        forgot(email.toUpperCase(), status().isTooManyRequests());
    }

    @Test
    void bodyIsReplayedToTheControllerAfterTheFilterConsumesIt() throws Exception {
        String email = "replay-" + System.nanoTime() + "@t.io";
        authService.register(email, "old-password-here", "Replay Me");

        forgot(email, status().isAccepted());

        // The filter reads the body to extract "email" for the bucket key, then must hand
        // an equivalent stream to the controller. If CachedBodyRequest didn't replay it,
        // @RequestBody would bind nothing/blank and startReset would silently no-op (unknown
        // address -> 202, no mail) instead of finding this real, just-registered user.
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(eq(email), any(), eq("reset"), vars.capture());
        assertLinkPresent(vars);
    }

    private static void assertLinkPresent(ArgumentCaptor<Map<String, Object>> vars) {
        if (vars.getValue().get("link") == null) throw new AssertionError("reset mail missing link");
    }

    @Test
    void differentAddressesDoNotShareABucket() throws Exception {
        String exhausted = "solo-" + System.nanoTime() + "@x.io";
        for (int i = 0; i < 3; i++) {
            forgot(exhausted, status().isAccepted());
        }
        forgot(exhausted, status().isTooManyRequests());

        // fresh addresses, untouched buckets — unaffected by the exhausted one above
        forgot("other-a-" + System.nanoTime() + "@x.io", status().isAccepted());
        forgot("other-b-" + System.nanoTime() + "@x.io", status().isAccepted());
    }
}
