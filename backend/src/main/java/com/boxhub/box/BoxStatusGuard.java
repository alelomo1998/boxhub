package com.boxhub.box;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The single authority on what a box's lifecycle status permits. SUSPENDED and REJECTED
 * are both "unreachable" (one kill-switch code — the distinction is superadmin-internal);
 * PENDING may prepare but not reach outward (invites, TVs).
 */
public final class BoxStatusGuard {

    private BoxStatusGuard() {}

    public static void requireReachable(Box box) {
        if ("SUSPENDED".equals(box.getStatus()) || "REJECTED".equals(box.getStatus()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "BOX_SUSPENDED");
    }

    public static void requireActive(Box box) {
        requireReachable(box);
        if ("PENDING".equals(box.getStatus()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "BOX_PENDING");
    }
}
