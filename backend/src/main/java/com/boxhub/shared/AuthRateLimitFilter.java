package com.boxhub.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

// ponytail: in-memory per-node buckets; move to Redis when a second node exists.
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> LIMITED = Set.of(
            "/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/tv/pair",
            "/api/auth/verify", "/api/auth/verify/resend", "/api/auth/password/forgot",
            "/api/auth/password/reset", "/api/auth/signup-box", "/api/auth/waitlist",
            // Single-use email token in the body is its only credential, same as verify and
            // password/reset above — so it gets the same per-IP guessing limit they do.
            "/api/me/email/confirm");

    private static final Set<String> EMAIL_LIMITED = Set.of(
            "/api/auth/verify/resend", "/api/auth/password/forgot");
    private static final int EMAIL_LIMIT = 3;

    // Extended M11 rule groups. Ant patterns so a variable segment (e.g. the session id in
    // /book, the token in /api/invites/*) can still be matched — LIMITED above only ever did
    // an exact string compare, which is why it could never cover these.
    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

    private static final List<String> WRITE_PATTERNS = List.of(
            "/api/box/invites", "/api/box/media", "/api/box/subscriptions/checkout",
            "/api/box/sessions/*/book");

    private static final List<String> LOOKUP_PATTERNS = List.of(
            "/api/invites/*", "/api/box/receipts/*");

    private final int limit;
    private final int writeLimit;
    private final int lookupLimit;
    private final int globalLimit;

    private final Cache<String, AtomicInteger> counters = newMinuteCache();
    private final Cache<String, AtomicInteger> writeCounters = newMinuteCache();
    private final Cache<String, AtomicInteger> lookupCounters = newMinuteCache();
    private final Cache<String, AtomicInteger> globalCounters = newMinuteCache();
    private final Cache<String, AtomicInteger> emailCounters = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(1))
            .maximumSize(100_000)
            .build();

    public AuthRateLimitFilter(@Value("${boxhub.auth-rate-limit}") int limit,
                               @Value("${boxhub.rate-limit.write}") int writeLimit,
                               @Value("${boxhub.rate-limit.lookup}") int lookupLimit,
                               @Value("${boxhub.rate-limit.global}") int globalLimit) {
        this.limit = limit;
        this.writeLimit = writeLimit;
        this.lookupLimit = lookupLimit;
        this.globalLimit = globalLimit;
    }

    private static Cache<String, AtomicInteger> newMinuteCache() {
        return Caffeine.newBuilder().expireAfterWrite(Duration.ofMinutes(1)).maximumSize(100_000).build();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Every /api/ request must pass through so the global per-IP ceiling can count it —
        // not just the exact-match auth routes as before. /actuator/** never matches this
        // prefix, so it's excluded without a separate check.
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String ip = clientIp(req);
        String uri = req.getRequestURI();
        String method = req.getMethod();

        boolean overGlobal = globalCounters.get(ip, k -> new AtomicInteger()).incrementAndGet() > globalLimit;

        boolean authLimited = "POST".equals(method) && LIMITED.contains(uri);
        boolean writeLimited = "POST".equals(method) && matchesAny(WRITE_PATTERNS, uri);
        boolean lookupLimited = "GET".equals(method) && matchesAny(LOOKUP_PATTERNS, uri);

        boolean overSpecific = false;
        if (authLimited) {
            overSpecific = counters.get(ip, k -> new AtomicInteger()).incrementAndGet() > limit;
        } else if (writeLimited) {
            overSpecific = writeCounters.get(ip, k -> new AtomicInteger()).incrementAndGet() > writeLimit;
        } else if (lookupLimited) {
            overSpecific = lookupCounters.get(ip, k -> new AtomicInteger()).incrementAndGet() > lookupLimit;
        }

        if (overGlobal || overSpecific) {
            tooMany(res);
            return;
        }

        if (authLimited && EMAIL_LIMITED.contains(uri)) {
            var wrapped = new ContentCachingRequestWrapper(req);
            String body = new String(wrapped.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            String email = extractEmail(body);
            if (email != null && emailCounters.get(email, k -> new AtomicInteger()).incrementAndGet() > EMAIL_LIMIT) {
                tooMany(res);
                return;
            }
            chain.doFilter(new CachedBodyRequest(req, body.getBytes(StandardCharsets.UTF_8)), res);
            return;
        }

        chain.doFilter(req, res);
    }

    private static boolean matchesAny(List<String> patterns, String uri) {
        for (String pattern : patterns) {
            if (PATH_MATCHER.match(pattern, uri)) return true;
        }
        return false;
    }

    private void tooMany(HttpServletResponse res) throws IOException {
        res.setStatus(429);
        res.setContentType("application/problem+json");
        res.getWriter().write("{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Too many requests\"}");
    }

    private String clientIp(HttpServletRequest req) {
        // X-Real-IP is set authoritatively by our nginx (overwrites any client value);
        // never trust client-supplied X-Forwarded-For for rate-limit identity.
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }

    private static String extractEmail(String body) {
        try {
            String email = new ObjectMapper().readTree(body).path("email").asText(null);
            // normalize: downstream (User lookup) does the same; buckets must match
            // or Foo@x.com / foo@x.com split into separate limiter buckets — a free bypass.
            return email == null ? null : email.toLowerCase().trim();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * ContentCachingRequestWrapper only caches what the controller reads — it cannot be used
     * to read the body up front in the filter. This wrapper captures the body once here and
     * replays it as a fresh ServletInputStream so the controller can still bind its DTO.
     */
    private static class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            var in = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public boolean isFinished() { return in.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener readListener) { }
                @Override public int read() { return in.read(); }
            };
        }

        @Override
        public java.io.BufferedReader getReader() {
            return new java.io.BufferedReader(new java.io.InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}
