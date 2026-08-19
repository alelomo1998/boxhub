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

    /** Subject of the synthetic root principal. Not a user; nothing may resolve it to one. */
    private static final String ROOT_SUBJECT = "00000000-0000-0000-0000-000000000000";

    /** True while a runAsRoot block is active on this thread. */
    public static boolean isRootScope() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof Jwt jwt
                && Boolean.TRUE.equals(jwt.getClaim("root"));
    }

    /**
     * Run {@code action} with the @TenantId filter DISABLED, so it sees every box. The explicit,
     * greppable opt-in that replaced the pre-M21 fail-open default.
     *
     * FOR PLATFORM JOBS ONLY — never on a thread serving a user request. A request has a caller
     * whose authorisation is knowable, so "see every box" is always the wrong tool there; the right
     * one is runAsBox(theBoxTheyAskedFor) plus a check that the box is theirs to see. Gated by a
     * grep recorded in docs/TENANCY.md.
     *
     * The principal it installs carries NO authorities: this grants database visibility, never
     * authorisation. It is also not a box, so an INSERT of a @TenantId entity inside it fails on
     * the foreign key rather than silently landing somewhere.
     *
     * Same load-bearing ordering rule as runAsBox: install it BEFORE the session/transaction opens.
     * A nested runAsBox REPLACES this authentication and restores it in its own finally, so "a real
     * box wins over root, and root comes back on exit" is a property of SecurityContextHolder
     * rather than of a flag someone has to remember to juggle.
     */
    public static <T> T runAsRoot(java.util.function.Supplier<T> action) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("root").header("alg", "HS256")
                    .subject(ROOT_SUBJECT)
                    .claim("root", true)
                    .issuedAt(java.time.Instant.now())
                    .expiresAt(java.time.Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(
                            jwt, java.util.List.of()));
            return action.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }

    public static void runAsRoot(Runnable action) {
        runAsRoot(() -> { action.run(); return null; });
    }

    private static Jwt jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt))
            throw new AccessDeniedException("Authentication required");
        return jwt;
    }
}
