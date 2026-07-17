package com.boxhub.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

@Service
public class CookieService {

    public static final String AT = "bh_at";
    public static final String BT = "bh_bt";
    public static final String RT = "bh_rt";

    private static final String API_PATH = "/api";
    private static final String REFRESH_PATH = "/api/auth";

    private final boolean secure;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public CookieService(@Value("${boxhub.cookie.secure}") boolean secure,
                         @Value("${boxhub.jwt.access-ttl}") Duration accessTtl,
                         @Value("${boxhub.jwt.refresh-ttl}") Duration refreshTtl) {
        this.secure = secure;
        this.accessTtl = accessTtl;
        this.refreshTtl = refreshTtl;
    }

    public ResponseCookie access(String jwt) { return build(AT, jwt, API_PATH, accessTtl, "Lax"); }

    public ResponseCookie box(String jwt) { return build(BT, jwt, API_PATH, accessTtl, "Lax"); }

    /** Strict: the refresh cookie should never ride a cross-site request, ever. */
    public ResponseCookie refresh(String raw) { return build(RT, raw, REFRESH_PATH, refreshTtl, "Strict"); }

    public List<ResponseCookie> clearAll() {
        return List.of(expire(AT, API_PATH), expire(BT, API_PATH), expire(RT, REFRESH_PATH));
    }

    public ResponseCookie clearBox() { return expire(BT, API_PATH); }

    private ResponseCookie build(String name, String value, String path, Duration ttl, String sameSite) {
        return ResponseCookie.from(name, value)
                .httpOnly(true).secure(secure).path(path).maxAge(ttl).sameSite(sameSite).build();
    }

    private ResponseCookie expire(String name, String path) {
        return ResponseCookie.from(name, "")
                .httpOnly(true).secure(secure).path(path).maxAge(0).sameSite("Lax").build();
    }
}
