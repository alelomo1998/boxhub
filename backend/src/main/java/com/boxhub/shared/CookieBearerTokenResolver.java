package com.boxhub.shared;

import com.boxhub.identity.CookieService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.stereotype.Component;

/**
 * Header first, cookies second.
 *
 * Header-first keeps every pre-M8 test (and any API client) working unchanged. It is also
 * why CSRF can be scoped to cookie-authenticated requests only: a request carrying an
 * Authorization header cannot be forged by another site.
 *
 * For /api/box/** the box token wins when present; everywhere else the user token does —
 * so a superadmin who has selected a box does not lose their superadmin claim (it rides
 * the user token only).
 */
@Component
public class CookieBearerTokenResolver implements BearerTokenResolver {

    private final DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();

    // expired-cookie-must-not-block: BearerTokenAuthenticationFilter authenticates whatever
    // resolve() returns BEFORE authorization runs, so a stale/expired bh_at cookie would 401
    // these permitAll endpoints — e.g. a browser holding an expired access cookie could not
    // even log back in. None of these endpoints need a principal derived from a cookie: login/
    // register/verify/password-reset are anonymous by nature, and refresh/logout/csrf read the
    // refresh cookie (or nothing) directly rather than relying on resolved-bearer auth.
    // /api/stripe/webhook is here for the same reason: an external, cookie-less Stripe POST that
    // must never be authenticated off of some unrelated visitor's stray browser cookie — the
    // webhook establishes its own synthetic per-box Authentication (runAsBox) after verifying the
    // Stripe-Signature header, and must not inherit ambient SecurityContext from resolve().
    private static final java.util.Set<String> PUBLIC_AUTH_PATHS = java.util.Set.of(
            "/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/logout",
            "/api/auth/csrf", "/api/auth/verify", "/api/auth/verify/resend",
            "/api/auth/password/forgot", "/api/auth/password/reset", "/api/auth/providers",
            "/api/me/email/confirm",
            "/api/auth/signup-box", "/api/auth/waitlist", "/api/auth/signup-mode",
            "/api/stripe/webhook");

    @Override
    public String resolve(HttpServletRequest request) {
        String fromHeader = header.resolve(request);
        if (fromHeader != null) return fromHeader;

        if (PUBLIC_AUTH_PATHS.contains(request.getRequestURI())) return null;

        String box = cookie(request, CookieService.BT);
        String user = cookie(request, CookieService.AT);

        if (request.getRequestURI().startsWith("/api/box/")) {
            return box != null ? box : user;
        }
        return user != null ? user : box;
    }

    public static String cookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (name.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) return c.getValue();
        }
        return null;
    }
}
