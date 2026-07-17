package com.boxhub.shared;

import com.boxhub.identity.MembershipRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

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

    /**
     * A box's only active admin must not be removable — the box would be left
     * unadministrable. Shared by MemberController (demote/suspend) and
     * AccountService (self-deletion) so the rule lives in exactly one place.
     */
    public static void assertNotLastAdmin(MembershipRepository memberships, UUID boxId) {
        if (memberships.countByBoxIdAndRoleAndStatus(boxId, "BOX_ADMIN", "ACTIVE") <= 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "LAST_ADMIN");
    }
}
