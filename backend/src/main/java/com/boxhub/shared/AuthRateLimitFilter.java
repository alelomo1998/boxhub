package com.boxhub.shared;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

// ponytail: in-memory per-node buckets; move to Redis when a second node exists.
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> LIMITED = Set.of(
            "/api/auth/login", "/api/auth/register", "/api/auth/refresh");

    private final int limit;
    private final Cache<String, AtomicInteger> counters = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(1))
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
            res.setStatus(429);
            res.setContentType("application/problem+json");
            res.getWriter().write("{\"status\":429,\"title\":\"Too Many Requests\",\"detail\":\"Too many requests\"}");
            return;
        }
        chain.doFilter(req, res);
    }

    private String clientIp(HttpServletRequest req) {
        // X-Real-IP is set authoritatively by our nginx (overwrites any client value);
        // never trust client-supplied X-Forwarded-For for rate-limit identity.
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }
}
