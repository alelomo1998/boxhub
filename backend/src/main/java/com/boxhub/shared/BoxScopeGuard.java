package com.boxhub.shared;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.UUID;

/**
 * The box a client BELIEVES is active, asserted per request against the box its token actually
 * carries.
 *
 * <p>Why it exists: the active box is one httpOnly cookie (bh_bt) plus one localStorage key, and
 * localStorage is shared across tabs. Switching box in one tab silently repoints every other tab,
 * whose next write then lands in a box the user is not looking at. Invisible with one box; routine
 * once a user holds three.
 *
 * <p>THIS DOES NOT WEAKEN "never trust box ids from request params" (docs/TENANCY.md). The header
 * can only REJECT a request; it never resolves a tenant. The tenant still comes from the JWT and
 * only from the JWT — this compares the two and refuses to proceed when they disagree.
 *
 * <p>An absent header is not an assertion: API clients, the TV surface and the existing e2e specs
 * send none and must keep working. An unparseable one is treated as a mismatch rather than a 400 —
 * the client's recovery path is identical either way (re-mint once, then give up), so a second
 * status code would buy nothing.
 *
 * <p>A HandlerInterceptor, deliberately, and not a servlet Filter: throwing from here reaches
 * ApiExceptionHandler, so the response is the same problem+json shape as every other reason code.
 * A filter runs outside the DispatcherServlet and would have to write that body by hand.
 */
@Configuration
public class BoxScopeGuard implements HandlerInterceptor, WebMvcConfigurer {

    static final String HEADER = "X-Box-Id";

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/box/**");
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String asserted = request.getHeader(HEADER);
        if (asserted == null || asserted.isBlank()) return true;

        UUID actual = TenantContext.boxIdOrNull();
        if (actual == null || !actual.equals(parseOrNull(asserted)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "STALE_BOX");
        return true;
    }

    private static UUID parseOrNull(String raw) {
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }
}
