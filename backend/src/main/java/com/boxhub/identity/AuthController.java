package com.boxhub.identity;

import com.boxhub.shared.CookieBearerTokenResolver;
import com.boxhub.shared.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokens;
    private final MembershipRepository membershipRepo;
    private final UserRepository userRepo;
    private final CookieService cookies;
    private final EmailTokenService emailTokens;
    private final AccountService accounts;
    private final boolean googleConfigured;

    public AuthController(AuthService authService, TokenService tokenService, RefreshTokenService refreshTokens,
                          MembershipRepository membershipRepo, UserRepository userRepo, CookieService cookies,
                          EmailTokenService emailTokens, AccountService accounts,
                          @Value("${BOXHUB_GOOGLE_CLIENT_ID:}") String googleClientId) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.refreshTokens = refreshTokens;
        this.membershipRepo = membershipRepo;
        this.userRepo = userRepo;
        this.cookies = cookies;
        this.emailTokens = emailTokens;
        this.accounts = accounts;
        this.googleConfigured = !googleClientId.isBlank();
    }

    record RegisterRequest(@NotBlank @Email String email,
                           @NotBlank @Size(min = 8, max = 100) String password,
                           @NotBlank @Size(max = 100) String name) {}
    record UserResponse(UUID id, String email, String name) {}
    public record MembershipDto(UUID boxId, String boxName, String boxSlug, String role) {}
    public record SessionResponse(List<MembershipDto> memberships) {}
    record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}
    record TokenRequest(@NotBlank String token) {}
    record EmailRequest(@NotBlank @Email String email) {}
    record ProvidersResponse(boolean google) {}

    /**
     * Hands the client an XSRF-TOKEN cookie before it does anything else.
     *
     * Spring Security 6's CSRF token is deferred: CookieCsrfTokenRepository only writes the
     * Set-Cookie when CsrfToken.getToken() is actually called. An empty handler body never
     * touches it, so the cookie never went out. Injecting the token and calling getToken()
     * forces it.
     */
    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf(org.springframework.security.web.csrf.CsrfToken token) {
        token.getToken();
    }

    /** Tells the frontend whether to render the Google button — no secrets, just a flag. */
    @GetMapping("/providers")
    public ProvidersResponse providers() {
        return new ProvidersResponse(googleConfigured);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest req) {
        authService.register(req.email(), req.password(), req.name());
        // Body must be built from the request only, never the returned entity: on a taken
        // address register() returns the REAL owner, and echoing it would leak their id/name —
        // an enumeration oracle. Normalize the same way the service does so both branches match.
        return new UserResponse(UUID.randomUUID(), req.email().toLowerCase().trim(), req.name());
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        User u = authService.login(req.email(), req.password());
        return withSession(u, http, HttpStatus.OK);
    }

    @PostMapping("/verify")
    public ResponseEntity<SessionResponse> verify(@Valid @RequestBody TokenRequest req, HttpServletRequest http) {
        EmailToken t = emailTokens.consume(req.token(), EmailTokenService.VERIFY);
        User u = t.getUser();
        u.setEmailVerified(true);
        userRepo.save(u);
        return withSession(u, http, HttpStatus.OK); // clicking the link logs them straight in
    }

    /** Always 202: a 404 here would confirm whether an address is registered. */
    @PostMapping("/verify/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendVerification(@Valid @RequestBody EmailRequest req) {
        userRepo.findByEmail(req.email().toLowerCase().trim())
                .filter(u -> !u.isEmailVerified())
                .ifPresent(authService::sendVerification);
    }

    record ResetRequest(@NotBlank String token, @NotBlank @Size(min = 10, max = 100) String password) {}

    /** Always 202. A 404 would confirm whether the address is registered. */
    @PostMapping("/password/forgot")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgot(@Valid @RequestBody EmailRequest req) {
        authService.startReset(req.email());
    }

    @PostMapping("/password/reset")
    public ResponseEntity<SessionResponse> reset(@Valid @RequestBody ResetRequest req, HttpServletRequest http) {
        User u = authService.completeReset(req.token(), req.password());
        refreshTokens.revokeAllFor(u.getId());
        return withSession(u, http, HttpStatus.OK); // then hand them a fresh, clean session
    }

    @PostMapping("/refresh")
    public ResponseEntity<SessionResponse> refresh(HttpServletRequest http) {
        String raw = com.boxhub.shared.CookieBearerTokenResolver.cookie(http, CookieService.RT);
        if (raw == null) throw new org.springframework.security.authentication.BadCredentialsException("No refresh cookie");
        var rotated = refreshTokens.rotate(raw, http.getHeader(HttpHeaders.USER_AGENT), clientIp(http));

        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.SET_COOKIE, cookies.access(tokenService.userToken(rotated.user())).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.refresh(rotated.rawToken()).toString())
                .body(new SessionResponse(membershipsOf(rotated.user())));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest http) {
        String raw = com.boxhub.shared.CookieBearerTokenResolver.cookie(http, CookieService.RT);
        if (raw != null) refreshTokens.revokeFamilyOf(raw);
        return clearedCookies().build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll() {
        refreshTokens.revokeAllFor(com.boxhub.shared.TenantContext.userId());
        return clearedCookies().build();
    }

    /**
     * Lives under /api/auth, not /api/me: bh_rt is Path-scoped to /api/auth (CookieService,
     * deliberately narrow), and marking the caller's own device as "current" needs that
     * cookie. Moving the endpoint here is cheaper than widening the refresh token's reach.
     */
    @GetMapping("/sessions")
    public List<AccountService.SessionDto> sessions(HttpServletRequest http) {
        String rawRefreshToken = CookieBearerTokenResolver.cookie(http, CookieService.RT);
        return accounts.sessions(TenantContext.userId(), rawRefreshToken);
    }

    record BoxTokenRequest(@jakarta.validation.constraints.NotNull UUID boxId) {}

    @PostMapping("/box-token")
    public ResponseEntity<Void> boxToken(@Valid @RequestBody BoxTokenRequest req) {
        UUID userId = com.boxhub.shared.TenantContext.userId();
        Membership m = membershipRepo.findByUserIdAndBoxId(userId, req.boxId())
                .filter(mem -> "ACTIVE".equals(mem.getStatus()))
                .orElseThrow(() -> new AccessDeniedException("No active membership in this box"));
        User u = userRepo.findById(userId).orElseThrow();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.box(tokenService.boxToken(u, m)).toString())
                .build();
    }

    private ResponseEntity<SessionResponse> withSession(User u, HttpServletRequest http, HttpStatus status) {
        String refresh = refreshTokens.issue(u, http.getHeader(HttpHeaders.USER_AGENT), clientIp(http));
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookies.access(tokenService.userToken(u)).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.clearBox().toString())
                .body(new SessionResponse(membershipsOf(u)));
    }

    private ResponseEntity.BodyBuilder clearedCookies() {
        ResponseEntity.BodyBuilder b = ResponseEntity.status(HttpStatus.NO_CONTENT);
        for (ResponseCookie c : cookies.clearAll()) b.header(HttpHeaders.SET_COOKIE, c.toString());
        return b;
    }

    private List<MembershipDto> membershipsOf(User u) {
        return authService.membershipsOf(u).stream()
                .map(m -> new MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
    }

    static String clientIp(HttpServletRequest req) {
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }
}
