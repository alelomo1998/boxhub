package com.boxhub.security;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.Mailer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * The M11 standing guarantee. Every mapped route must deny (a) no credentials, (b) a foreign box's
 * token, (c) an insufficient role. Default is DENY: a route that is neither allowlisted nor listed
 * in MIN_ROLE fails, so an endpoint added later cannot quietly skip tenancy.
 */
class AuthzConformanceTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    // Qualified: actuator contributes a second RequestMappingHandlerMapping
    // (controllerEndpointHandlerMapping). We want the MVC one — that is where /api/ lives.
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mapping;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @MockitoBean Mailer mailer;

    /** ATHLETE in box A; BOX_ADMIN in box B (the "foreign" box relative to any /api/box resource). */
    private String athleteToken, foreignBoxToken;

    @BeforeEach
    void fixture() {
        lenient().when(mailer.link(any())).thenReturn("http://localhost/x");
        long n = System.nanoTime();

        Box boxA = newBox("Sweep A " + n, "sweep-a-" + n);
        Box boxB = newBox("Sweep B " + n, "sweep-b-" + n);

        User athlete = authService.register("sweep-ath-" + n + "@t.io", "correct-horse-battery", "Sweep Athlete");
        athleteToken = tokenService.boxToken(athlete, member(athlete, boxA, "ATHLETE"));

        User foreignAdmin = authService.register("sweep-adm-" + n + "@t.io", "correct-horse-battery", "Sweep Admin B");
        foreignBoxToken = tokenService.boxToken(foreignAdmin, member(foreignAdmin, boxB, "BOX_ADMIN"));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setStatus("ACTIVE");
        return boxes.save(b);
    }

    private Membership member(User u, Box box, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        return memberships.save(m);
    }

    /** Deliberately not box-scoped. EVERY entry needs a justification comment. */
    private static final Set<String> PUBLIC_ALLOWLIST = Set.of(
            "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/csrf",
            "/api/auth/providers", "/api/auth/verify", "/api/auth/verify/resend",
            "/api/auth/password/forgot", "/api/auth/password/reset",
            "/api/auth/signup-box", "/api/auth/waitlist", "/api/auth/signup-mode",
            "/api/auth/logout",               // clears the cookie; must work with no/expired creds

            "/api/me/email/confirm",          // token in the link is the credential
            "/api/invites/{token}",           // public invite preview, unguessable token
            "/api/tv/pair", "/api/tv/pair/poll", "/api/tv/stream", // device pairing, pre-identity
            "/api/stripe/webhook",            // Stripe signature IS the credential
            "/actuator/health");

    /**
     * Minimum role per box-scoped route. A route missing here FAILS — state intent explicitly.
     * Roles are NOT inferable: RoleGuard is imperative, inside method bodies, so every value below
     * was read off the controller. ATHLETE = any active member of the box (no RoleGuard call);
     * COACH = RoleGuard.requireStaff(); BOX_ADMIN = RoleGuard.requireBoxAdmin().
     */
    private static final Map<String, String> MIN_ROLE = Map.ofEntries(
            // --- memberships & payments (M10) ---
            Map.entry("POST /api/box/subscriptions", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/subscriptions/{id}", "BOX_ADMIN"),
            Map.entry("POST /api/box/subscriptions/checkout", "ATHLETE"),
            Map.entry("GET /api/box/me/subscription", "ATHLETE"),
            Map.entry("GET /api/box/receipts/{paymentId}", "ATHLETE"), // + per-row payer/admin check
            Map.entry("GET /api/box/plans", "ATHLETE"),
            Map.entry("POST /api/box/plans", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/plans/{id}", "BOX_ADMIN"),
            Map.entry("GET /api/box/stripe", "BOX_ADMIN"),
            Map.entry("PUT /api/box/stripe", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/stripe", "BOX_ADMIN"),
            // --- box admin surface ---
            Map.entry("GET /api/box/admin-stats", "BOX_ADMIN"),
            Map.entry("GET /api/box/current", "ATHLETE"),
            Map.entry("PATCH /api/box/settings", "BOX_ADMIN"),
            Map.entry("GET /api/box/members", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/members/{membershipId}", "BOX_ADMIN"),
            Map.entry("GET /api/box/members/{membershipId}/profile", "ATHLETE"),
            Map.entry("POST /api/box/invites", "BOX_ADMIN"),
            Map.entry("GET /api/box/invites", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/invites/{id}", "BOX_ADMIN"),
            // --- announcements & class types ---
            Map.entry("GET /api/box/announcement", "ATHLETE"),
            Map.entry("PUT /api/box/announcement", "COACH"),
            Map.entry("DELETE /api/box/announcement", "COACH"),
            Map.entry("GET /api/box/class-templates", "ATHLETE"),
            Map.entry("POST /api/box/class-templates", "COACH"),
            Map.entry("PATCH /api/box/class-templates/{id}", "COACH"),
            Map.entry("GET /api/box/class-templates/{templateId}/skeleton", "COACH"),
            Map.entry("PUT /api/box/class-templates/{templateId}/skeleton", "COACH"),
            // --- schedule, booking, roster ---
            Map.entry("GET /api/box/home", "ATHLETE"),
            Map.entry("GET /api/box/sessions", "ATHLETE"),
            Map.entry("PATCH /api/box/sessions/{id}", "COACH"),
            Map.entry("GET /api/box/sessions/{id}/detail", "ATHLETE"),
            Map.entry("POST /api/box/sessions/{id}/book", "ATHLETE"),
            Map.entry("DELETE /api/box/sessions/{id}/booking", "ATHLETE"),
            Map.entry("GET /api/box/my-bookings", "ATHLETE"),
            Map.entry("GET /api/box/sessions/{id}/roster", "COACH"),
            Map.entry("POST /api/box/sessions/{id}/checkin", "COACH"),
            Map.entry("POST /api/box/sessions/{id}/uncheck", "COACH"),
            Map.entry("POST /api/box/sessions/{id}/no-show", "COACH"),
            Map.entry("GET /api/box/sessions/{sessionId}/timer", "COACH"),
            Map.entry("POST /api/box/sessions/{sessionId}/timer", "COACH"),
            // --- programming ---
            Map.entry("GET /api/box/sessions/{sessionId}/items", "ATHLETE"),
            Map.entry("PUT /api/box/sessions/{sessionId}/items", "COACH"),
            Map.entry("PATCH /api/box/sessions/{sessionId}/programming", "COACH"),
            Map.entry("GET /api/box/wods", "ATHLETE"),
            Map.entry("GET /api/box/wods/{id}", "ATHLETE"),
            Map.entry("POST /api/box/wods", "COACH"),
            Map.entry("PATCH /api/box/wods/{id}", "COACH"),
            Map.entry("DELETE /api/box/wods/{id}", "COACH"),
            Map.entry("POST /api/box/wods/{id}/duplicate", "COACH"),
            Map.entry("GET /api/box/movements", "ATHLETE"),
            Map.entry("POST /api/box/movements", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/movements/{id}", "BOX_ADMIN"),
            Map.entry("GET /api/box/benchmarks", "ATHLETE"),
            Map.entry("GET /api/box/benchmarks/{id}", "ATHLETE"),
            Map.entry("POST /api/box/benchmarks/{id}/clone", "COACH"),
            Map.entry("GET /api/box/my-class-today", "ATHLETE"),
            // --- performance ---
            Map.entry("PUT /api/box/sessions/items/{itemId}/score", "ATHLETE"),
            Map.entry("GET /api/box/sessions/items/{itemId}/score", "ATHLETE"),
            Map.entry("POST /api/box/sessions/items/{itemId}/score/{membershipId}", "COACH"),
            Map.entry("GET /api/box/sessions/items/{itemId}/leaderboard", "ATHLETE"),
            Map.entry("GET /api/box/my-scores", "ATHLETE"),
            Map.entry("GET /api/box/benchmark-history", "ATHLETE"),
            Map.entry("POST /api/box/lifts", "ATHLETE"),
            Map.entry("GET /api/box/lifts", "ATHLETE"),
            Map.entry("GET /api/box/lifts/prs", "ATHLETE"),
            // --- profile, media, TV ---
            Map.entry("GET /api/box/me/profile", "ATHLETE"),
            Map.entry("PATCH /api/box/me/profile", "ATHLETE"),
            Map.entry("PUT /api/box/me/avatar", "ATHLETE"),
            Map.entry("POST /api/box/media", "ATHLETE"),
            Map.entry("POST /api/box/tv/claim", "COACH"),
            Map.entry("GET /api/box/tv", "COACH"),
            Map.entry("PATCH /api/box/tv/{id}", "COACH"),
            Map.entry("DELETE /api/box/tv/{id}", "COACH"));

    /**
     * Routes known to fail TODAY. Task 2 fixes each and empties this set.
     *
     * Every entry below is the SAME defect: the handler takes `@Valid @RequestBody`, and Spring
     * resolves + validates that argument BEFORE the method body runs — so the imperative
     * RoleGuard/tenant check on line 1 of the body never executes and the caller gets 400 instead
     * of 403/404. The sweep counts that as a failure because the 400 proves nothing: it is the
     * validator talking, not authorization, so the assertion cannot tell a guarded route from an
     * unguarded one. Fix = authorize before validating (move the guard ahead of body binding).
     */
    private static final Set<String> KNOWN_GAPS = Set.of(
            // requireBoxAdmin() sits after @Valid ConnectRequest — athlete gets 400, not 403
            "PUT /api/box/stripe",
            // requireBoxAdmin() after @Valid CreatePlanRequest
            "POST /api/box/plans",
            // requireBoxAdmin() after @Valid CreateInviteRequest
            "POST /api/box/invites",
            // requireBoxAdmin() after @Valid CreateMovementRequest
            "POST /api/box/movements",
            // requireStaff() + tenant-scoped session lookup after @Valid ItemsRequest
            "PUT /api/box/sessions/{sessionId}/items",
            // requireStaff() + tenant-scoped session lookup after @Valid ProgrammingRequest
            "PATCH /api/box/sessions/{sessionId}/programming",
            // requireStaff() + tenant-scoped template lookup after @Valid SkeletonRequest
            "PUT /api/box/class-templates/{templateId}/skeleton");

    private record Route(String method, String pattern) {
        String key() { return method + " " + pattern; }
    }

    private List<Route> routes() {
        List<Route> out = new ArrayList<>();
        mapping.getHandlerMethods().forEach((info, handler) -> {
            var patterns = info.getPathPatternsCondition() != null
                    ? info.getPathPatternsCondition().getPatternValues()
                    : Set.<String>of();
            var methods = info.getMethodsCondition().getMethods();
            for (String p : patterns) {
                if (!p.startsWith("/api/")) continue;
                if (methods.isEmpty()) out.add(new Route("GET", p));
                else methods.forEach(m -> out.add(new Route(m.name(), p)));
            }
        });
        out.sort(Comparator.comparing(Route::key));
        return out;
    }

    /** Path variables get a random UUID — authz must reject before any id is resolved. */
    private String concrete(String pattern) {
        return pattern.replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
    }

    private MockHttpServletRequestBuilder req(Route r) {
        var b = request(HttpMethod.valueOf(r.method()), concrete(r.pattern()))
                .contentType(APPLICATION_JSON).content("{}");
        // A write with no Authorization header hits the CSRF filter first and 403s, hiding the
        // 401 we are actually testing. Same reason SuperadminBoxApiTest uses .with(csrf()).
        return "GET".equals(r.method()) ? b : b.with(csrf());
    }

    @Test
    void everyRouteDeniesAnonymousForeignTenantAndInsufficientRole() throws Exception {
        List<String> failures = new ArrayList<>();
        List<String> unlisted = new ArrayList<>();

        for (Route r : routes()) {
            if (PUBLIC_ALLOWLIST.contains(r.pattern())) continue;
            if (KNOWN_GAPS.contains(r.key())) continue;

            // (a) no credentials
            int anon = mvc.perform(req(r)).andReturn().getResponse().getStatus();
            if (anon != 401) failures.add(r.key() + " anonymous -> " + anon + " (want 401)");

            if (!r.pattern().startsWith("/api/box/")) continue;

            // (b) a valid token for a DIFFERENT box, against a resource id that box does not own.
            //
            // Only routes carrying a path variable can leak a foreign id, and only those have a
            // meaningful "foreign" probe at all: a collection route like GET /api/box/plans or
            // POST /api/box/media names no resource, so box B's admin calling it correctly gets
            // box B's own data — a 2xx there is right, not a tenancy break. The leak surface is
            // exactly the id-bearing routes, which is why the brief's target is "404 on resource
            // lookups so foreign ids do not leak".
            if (r.pattern().contains("{")) {
                int foreign = mvc.perform(req(r).header("Authorization", "Bearer " + foreignBoxToken))
                        .andReturn().getResponse().getStatus();
                if (foreign < 400 || foreign == 400)
                    failures.add(r.key() + " foreign-box -> " + foreign + " (want 403/404; 400 means validation ran before authz)");
            }

            // (c) insufficient role
            String need = MIN_ROLE.get(r.key());
            if (need == null) { unlisted.add(r.key()); continue; }
            if ("BOX_ADMIN".equals(need)) {
                int athlete = mvc.perform(req(r).header("Authorization", "Bearer " + athleteToken))
                        .andReturn().getResponse().getStatus();
                if (athlete != 403) failures.add(r.key() + " athlete-on-admin-route -> " + athlete + " (want 403)");
            }
        }

        assertThat(unlisted)
                .as("Routes with no declared minimum role. Add each to MIN_ROLE with its real intent.")
                .isEmpty();
        assertThat(failures).as("Authz conformance failures").isEmpty();
    }
}
