package com.boxhub.shared;

import com.boxhub.identity.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
 * registration ourselves, gated by the same @ConditionalOnProperty, sidesteps that entirely.
 *
 * Gated on the raw BOXHUB_GOOGLE_CLIENT_ID env var, not a YAML property with a ${VAR:} empty
 * default: @ConditionalOnProperty without havingValue matches on any non-null value, including
 * "" — so a property that always resolves (even to blank) never turns the condition off. An
 * unset env var is the one property source that reads back as genuinely absent (null).
 */
@Configuration
@ConditionalOnProperty("BOXHUB_GOOGLE_CLIENT_ID")
public class OAuth2SecurityConfig {

    @Bean
    ClientRegistrationRepository clientRegistrationRepository(
            @Value("${BOXHUB_GOOGLE_CLIENT_ID}") String clientId,
            @Value("${BOXHUB_GOOGLE_CLIENT_SECRET:}") String clientSecret) {
        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(clientId)
                .clientSecret(clientSecret)
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
            OAuth2User principal = (OAuth2User) authentication.getPrincipal();

            User user = google.resolve(
                    principal.getAttribute("sub"),
                    principal.getAttribute("email"),
                    Boolean.TRUE.equals(principal.getAttribute("email_verified")),
                    principal.getAttribute("name"));

            String refresh = refreshTokens.issue(user, request.getHeader(HttpHeaders.USER_AGENT), clientIp(request));
            response.addHeader(HttpHeaders.SET_COOKIE, cookies.access(tokens.userToken(user)).toString());
            response.addHeader(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString());
            response.sendRedirect("/");
        };
    }

    private static String clientIp(HttpServletRequest req) {
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }
}
