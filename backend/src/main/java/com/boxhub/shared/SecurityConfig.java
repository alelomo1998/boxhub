package com.boxhub.shared;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/refresh",
                        "/actuator/health").permitAll()
                .requestMatchers("/api/auth/box-token").authenticated()
                .requestMatchers("/api/box/**").hasAuthority("SCOPE_box")
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/invites/*").permitAll()
                .requestMatchers("/api/invites/*/accept").authenticated()
                .requestMatchers("/api/admin/**").hasRole("SUPERADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(jwtAuthConverter())));
        return http.build();
    }

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
