package com.boxhub.shared;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.UUID;

/** Resolves the active tenant from the box-scoped JWT. Never trust box ids from request params. */
public final class TenantContext {

    private TenantContext() {}

    public static UUID requireBoxId() {
        String boxId = jwt().getClaimAsString("box_id");
        if (boxId == null) throw new AccessDeniedException("Box-scoped token required");
        return UUID.fromString(boxId);
    }

    /** Tenant id for the Hibernate resolver: null when unauthenticated or user-scoped. */
    public static UUID boxIdOrNull() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) return null;
        String boxId = jwt.getClaimAsString("box_id");
        return boxId == null ? null : UUID.fromString(boxId);
    }

    public static String role() {
        return jwt().getClaimAsString("role");
    }

    public static UUID userId() {
        return UUID.fromString(jwt().getSubject());
    }

    /**
     * Run {@code action} with a synthetic box-scoped Authentication installed: @TenantId reads are
     * filtered to {@code boxId} and @TenantId inserts are stamped with it. The single implementation
     * of a pattern that used to be copy-pasted into seven classes.
     *
     * THE ORDERING IS LOAD-BEARING, NOT STYLISTIC. Hibernate resolves and caches the current tenant
     * once, when the session opens. This must therefore wrap the code that OPENS the transaction —
     * calling it inside an already-running @Transactional method is a silent no-op. See
     * docs/TENANCY.md.
     */
    public static <T> T runAsBox(UUID boxId, java.util.function.Supplier<T> action) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("system").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(java.time.Instant.now())
                    .expiresAt(java.time.Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(
                            jwt, java.util.List.of(
                                    new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_box"))));
            return action.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }

    public static void runAsBox(UUID boxId, Runnable action) {
        runAsBox(boxId, () -> { action.run(); return null; });
    }

    private static Jwt jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt))
            throw new AccessDeniedException("Authentication required");
        return jwt;
    }
}
