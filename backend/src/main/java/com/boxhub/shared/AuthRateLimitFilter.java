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
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

// ponytail: in-memory per-node buckets; move to Redis when a second node exists.
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> LIMITED = Set.of(
            "/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/tv/pair",
            "/api/auth/verify", "/api/auth/verify/resend", "/api/auth/password/forgot",
            "/api/auth/password/reset");

    private static final Set<String> EMAIL_LIMITED = Set.of(
            "/api/auth/verify/resend", "/api/auth/password/forgot");
    private static final int EMAIL_LIMIT = 3;

    private final int limit;
    private final Cache<String, AtomicInteger> counters = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(1))
            .maximumSize(100_000)
            .build();
    private final Cache<String, AtomicInteger> emailCounters = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(1))
            .maximumSize(100_000)
            .build();

    public AuthRateLimitFilter(@Value("${boxhub.auth-rate-limit}") int limit) {
        this.limit = limit;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !("POST".equals(request.getMethod()) && LIMITED.contains(request.getRequestURI()));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String ip = clientIp(req);
        int n = counters.get(ip, k -> new AtomicInteger()).incrementAndGet();
        if (n > limit) {
            tooMany(res);
            return;
        }

        if (EMAIL_LIMITED.contains(req.getRequestURI())) {
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
