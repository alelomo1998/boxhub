package com.boxhub.shared;

import org.springframework.security.access.AccessDeniedException;

public final class RoleGuard {
    private RoleGuard() {}

    public static void requireBoxAdmin() {
        if (!"BOX_ADMIN".equals(TenantContext.role()))
            throw new AccessDeniedException("Box admin role required");
    }
}
