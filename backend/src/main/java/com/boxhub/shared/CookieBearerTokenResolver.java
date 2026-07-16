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

    @Override
    public String resolve(HttpServletRequest request) {
        String fromHeader = header.resolve(request);
        if (fromHeader != null) return fromHeader;

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
