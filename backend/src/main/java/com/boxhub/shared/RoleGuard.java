package com.boxhub.shared;

import org.springframework.security.access.AccessDeniedException;

public final class RoleGuard {
    private RoleGuard() {}

    public static void requireBoxAdmin() {
        if (!"BOX_ADMIN".equals(TenantContext.role()))
            throw new AccessDeniedException("Box admin role required");
    }

    /** Coach or box admin (session management, rosters, check-in). */
    public static void requireStaff() {
        String role = TenantContext.role();
        if (!"COACH".equals(role) && !"BOX_ADMIN".equals(role))
            throw new AccessDeniedException("Coach or box admin role required");
    }
}
