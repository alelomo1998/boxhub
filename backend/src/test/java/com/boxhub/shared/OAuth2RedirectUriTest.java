package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * BoxHub runs behind nginx, which terminates TLS. Spring's default OAuth2 redirect_uri template
 * ({@code {baseUrl}/login/oauth2/code/{registrationId}}) is built from the request as the
 * servlet container saw it — plain http, on an internal host — so it never matches the https
 * registration in the Google console.
 * <p>
 * The fix is <b>not</b> {@code server.forward-headers-strategy}: that installs
 * {@code ForwardedHeaderFilter} globally, which rewrites {@code getRemoteAddr()} from the
 * client-appendable {@code X-Forwarded-For} header and re-opens the rate-limit IP spoofing that
 * M1-T9 closed (see {@code AuthRateLimitFilter.clientIp()} and
 * {@code RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket}, which pins it). Instead
 * {@code OAuth2SecurityConfig.clientRegistrationRepository} sets an explicit {@code redirectUri}
 * built from {@code boxhub.app-url} — the same source every other absolute URL BoxHub emits
 * already uses ({@code Mailer.link}, the Stripe checkout return URLs). No proxy header is
 * trusted at all.
 */
@TestPropertySource(properties = {
        "BOXHUB_GOOGLE_CLIENT_ID=m12c-test-client-id.apps.googleusercontent.com",
        "boxhub.app-url=https://boxhub.example"
})
class OAuth2RedirectUriTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void redirectUriComesFromTheConfiguredAppUrlNotTheProxiedRequest() throws Exception {
        // The request arrives exactly as nginx forwards it: plain http, internal host. The
        // redirect_uri must still be the public https URL registered in the Google console.
        String location = mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andReturn().getResponse().getHeader("Location");

        assertThat(location).as("authorization redirect").startsWith("https://accounts.google.com/");

        String redirectUri = UriComponentsBuilder.fromUriString(location)
                .build().getQueryParams().getFirst("redirect_uri");
        assertThat(redirectUri).as("redirect_uri query parameter").isNotNull();
        assertThat(URLDecoder.decode(redirectUri, StandardCharsets.UTF_8))
                .isEqualTo("https://boxhub.example/login/oauth2/code/google");
    }
}
