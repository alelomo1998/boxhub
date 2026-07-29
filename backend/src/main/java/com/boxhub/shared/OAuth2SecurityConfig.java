package com.boxhub.shared;

import com.boxhub.identity.*;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.web.server.ResponseStatusException;

/**
 * Google SSO gets its own filter chain. oauth2Login stores the authorization request in a
 * session, and the API chain is STATELESS — rather than weaken the API's session policy for
 * the whole app, the OAuth dance is fenced off here at @Order(1). The API chain stays
 * stateless and untouched.
 *
 * Disabled entirely when no client id is configured, so dev and CI need no Google secrets.
 *
 * The ClientRegistrationRepository is built by hand from CommonOAuth2Provider.GOOGLE rather than
 * through Boot's spring.security.oauth2.client.registration.* binding: Boot's own
 * OAuth2ClientAutoConfiguration treats any bound sub-property under that prefix as "a client is
 * configured" and eagerly validates it, throwing IllegalStateException when the id is blank —
 * which is exactly the "unconfigured" default this whole class exists to support. Building the
 * registration ourselves, gated by the same condition as the class, sidesteps that entirely.
 *
 * Gated on the raw BOXHUB_GOOGLE_CLIENT_ID env var, not a YAML property with a ${VAR:} empty
 * default: @ConditionalOnProperty without havingValue matches on any non-null value, including
 * "" — so a property that always resolves (even to blank) never turns the condition off. An
 * unset env var is the one property source that reads back as genuinely absent (null).
 *
 * @ConditionalOnExpression + StringUtils.hasText (not @ConditionalOnProperty) for the same
 * "" reason one level down: an operator exporting BOXHUB_GOOGLE_CLIENT_ID="" as a placeholder
 * (unset-but-declared) makes the env var itself present-but-blank. @ConditionalOnProperty would
 * still flip the chain on, and ClientRegistration.Builder's hasText(clientId) assertion would
 * then crash boot. hasText() on the resolved value is blank-safe for both "unset" and "".
 */
@Configuration
@ConditionalOnExpression("T(org.springframework.util.StringUtils).hasText('${BOXHUB_GOOGLE_CLIENT_ID:}')")
public class OAuth2SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(OAuth2SecurityConfig.class);

    @Bean
    ClientRegistrationRepository clientRegistrationRepository(
            @Value("${BOXHUB_GOOGLE_CLIENT_ID}") String clientId,
            @Value("${BOXHUB_GOOGLE_CLIENT_SECRET:}") String clientSecret,
            @Value("${boxhub.app-url}") String appUrl) {
        // Absolute, from the app's own configured public URL — NOT Spring's default
        // "{baseUrl}/login/oauth2/code/{registrationId}" template. Behind nginx the request
        // Spring sees is plain http on an internal host, so the template yields an http://
        // redirect_uri that cannot match an https:// registration in the Google console, and
        // Google rejects the callback. Every other absolute URL BoxHub emits already comes from
        // BOXHUB_APP_URL (Mailer.link, the Stripe checkout return URLs); this makes OAuth2 the
        // same. Deliberately NOT solved with server.forward-headers-strategy: that installs
        // ForwardedHeaderFilter globally, which rewrites getRemoteAddr() from the
        // client-appendable X-Forwarded-For and re-opens the rate-limit IP spoofing that M1-T9
        // closed. Pinned by RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket.
        String base = appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) : appUrl;
        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(clientId)
                .clientSecret(clientSecret)
                .redirectUri(base + "/login/oauth2/code/google")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }

    @Bean
    @Order(1)
    SecurityFilterChain googleChain(HttpSecurity http, AuthenticationSuccessHandler googleSuccessHandler)
            throws Exception {
        http.securityMatcher("/oauth2/**", "/login/oauth2/**")
            .csrf(c -> c.disable()) // the OAuth state parameter is the CSRF defence here
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .authorizeHttpRequests(a -> a.anyRequest().permitAll())
            .oauth2Login(o -> o.successHandler(googleSuccessHandler));
        return http.build();
    }

    @Bean
    AuthenticationSuccessHandler googleSuccessHandler(GoogleLinkService google, TokenService tokens,
                                                      RefreshTokenService refreshTokens, CookieService cookies) {
        return (request, response, authentication) -> {
            // This handler runs inside the security filter chain, ahead of the DispatcherServlet —
            // an exception thrown here never reaches @RestControllerAdvice, it hits ErrorPageFilter,
            // which hardcodes a whitelabel 500. Catch and redirect instead of letting anything escape.
            try {
                OAuth2User principal = (OAuth2User) authentication.getPrincipal();

                User user = google.resolve(
                        principal.getAttribute("sub"),
                        principal.getAttribute("email"),
                        Boolean.TRUE.equals(principal.getAttribute("email_verified")),
                        principal.getAttribute("name"));

                String refresh = refreshTokens.issue(user, request.getHeader(HttpHeaders.USER_AGENT), clientIp(request));
                response.addHeader(HttpHeaders.SET_COOKIE, cookies.access(tokens.userToken(user)).toString());
                response.addHeader(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString());
                // Fresh session never inherits a box context — same rule as AuthController.withSession,
                // otherwise user B signing in on a shared device inherits user A's bh_bt.
                response.addHeader(HttpHeaders.SET_COOKIE, cookies.clearBox().toString());
                response.sendRedirect("/");
            } catch (ResponseStatusException e) {
                if ("GOOGLE_EMAIL_UNVERIFIED".equals(e.getReason())) {
                    response.sendRedirect("/login?error=google_email_unverified");
                } else {
                    log.error("Google sign-in failed", e);
                    response.sendRedirect("/login?error=google");
                }
            } catch (Exception e) {
                log.error("Google sign-in failed", e);
                response.sendRedirect("/login?error=google");
            }
        };
    }

    private static String clientIp(HttpServletRequest req) {
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }
}
