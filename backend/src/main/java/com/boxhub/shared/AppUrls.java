package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * The single place that knows where rxed's URLs point.
 *
 * Two methods, deliberately named so the choice is obvious at every call site:
 *
 *  - {@link #appLink} — the Angular application, which lives under {@code boxhub.app-base}
 *    (default {@code /app}). Emailed links and the Stripe return URLs use this.
 *  - {@link #origin} — the bare server root. The OAuth2 callback lives here, NOT under /app,
 *    because nginx proxies /login/oauth2/ at the root and Google matches redirect_uri against a
 *    console registration. Prefixing it breaks Google SSO in production and nowhere else, which
 *    is the bug M12c fixed on 2026-07-29.
 */
@Component
public class AppUrls {

    private final String origin;
    private final String base;

    public AppUrls(@Value("${boxhub.app-url}") String appUrl,
                   @Value("${boxhub.app-base}") String appBase) {
        this.origin = appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) : appUrl;
        this.base = appBase.endsWith("/") ? appBase.substring(0, appBase.length() - 1) : appBase;
    }

    /** Absolute URL into the Angular app, e.g. appLink("/auth/verify?token=abc"). */
    public String appLink(String path) {
        return origin + base + path;
    }

    /** The bare server origin, with no app base. For the OAuth2 redirect-uri only. */
    public String origin() {
        return origin;
    }
}
