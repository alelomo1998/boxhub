package com.boxhub.shared;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    @Order(2)
    SecurityFilterChain filterChain(HttpSecurity http, CookieBearerTokenResolver bearerTokenResolver)
            throws Exception {
        // Cookie-authenticated writes need CSRF. Bearer-header writes cannot be forged
        // cross-site, so they do not — which is what keeps the pre-M8 tests green.
        // TV_PAIRING_PATHS are unauthenticated device endpoints (TVs/Fire Sticks polling for a
        // token) that cannot do the csrf-cookie dance and carry no session cookie to forge —
        // CSRF is meaningless there, so they're excluded outright.
        org.springframework.security.web.util.matcher.RequestMatcher csrfRequired = req ->
                !SAFE_METHODS.contains(req.getMethod()) && req.getHeader("Authorization") == null
                        && !TV_PAIRING_PATHS.contains(req.getRequestURI());

        http.csrf(c -> c
                .csrfTokenRepository(org.springframework.security.web.csrf.CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler())
                .requireCsrfProtectionMatcher(csrfRequired)
                // oauth2ResourceServer() rewrites the CSRF matcher to exempt any request whose
                // bearer token resolves — with our cookie-aware resolver that would exempt
                // cookie-authenticated requests too, defeating CSRF entirely. Re-assert our
                // matcher on the built filter, after that composition has happened.
                // Verified against Spring Security 6.4.2: CsrfConfigurer.configure() composes
                // And[matcher, Not[BearerTokenRequestMatcher]] and object post-processors run
                // after that composition — re-verify this on any Spring Security upgrade.
                // Covered by aCookieRequestWithoutCsrfIsRejected + theRealCsrfRoundTripWorksWithoutTestBypass.
                .withObjectPostProcessor(new org.springframework.security.config.ObjectPostProcessor<org.springframework.security.web.csrf.CsrfFilter>() {
                    @Override
                    public <O extends org.springframework.security.web.csrf.CsrfFilter> O postProcess(O filter) {
                        filter.setRequireCsrfProtectionMatcher(csrfRequired);
                        return filter;
                    }
                }))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/refresh",
                        "/api/auth/csrf", "/api/auth/verify", "/api/auth/verify/resend",
                        "/api/auth/password/forgot", "/api/auth/password/reset",
                        "/api/auth/logout", "/api/auth/providers", "/actuator/health").permitAll()
                .requestMatchers("/api/tv/pair", "/api/tv/pair/poll", "/api/tv/stream").permitAll()
                .requestMatchers("/api/auth/box-token", "/api/auth/logout-all").authenticated()
                .requestMatchers("/api/me/**").authenticated()
                .requestMatchers("/api/box/**").hasAuthority("SCOPE_box")
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/invites/*").permitAll()
                .requestMatchers("/api/invites/*/accept").authenticated()
                .requestMatchers("/api/admin/**").hasRole("SUPERADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o
                .bearerTokenResolver(bearerTokenResolver)
                .jwt(j -> j.jwtAuthenticationConverter(jwtAuthConverter())));
        return http.build();
    }

    private static final java.util.Set<String> SAFE_METHODS =
            java.util.Set.of("GET", "HEAD", "OPTIONS", "TRACE");

    private static final java.util.Set<String> TV_PAIRING_PATHS =
            java.util.Set.of("/api/tv/pair", "/api/tv/pair/poll");

    private org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter jwtAuthConverter() {
        var conv = new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter();
        conv.setJwtGrantedAuthoritiesConverter(jwt -> {
            var auths = new java.util.ArrayList<org.springframework.security.core.GrantedAuthority>();
            String scope = jwt.getClaimAsString("scope");
            if (scope != null) auths.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_" + scope));
            String role = jwt.getClaimAsString("role");
            if (role != null) auths.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
            if (Boolean.TRUE.equals(jwt.getClaim("superadmin")))
                auths.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_SUPERADMIN"));
            return auths;
        });
        return conv;
    }
}
