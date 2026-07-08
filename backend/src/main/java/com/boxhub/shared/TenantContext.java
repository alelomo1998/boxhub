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

    private static Jwt jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt))
            throw new AccessDeniedException("Authentication required");
        return jwt;
    }
}
