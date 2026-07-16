package com.boxhub.identity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

    public AuthController(AuthService authService, TokenService tokenService, RefreshTokenService refreshTokens,
                          MembershipRepository membershipRepo, UserRepository userRepo, CookieService cookies) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.refreshTokens = refreshTokens;
        this.membershipRepo = membershipRepo;
        this.userRepo = userRepo;
        this.cookies = cookies;
    }

    // register endpoint is rewritten again in Task 5 (email verification) — validation left as-is.
    record RegisterRequest(@NotBlank @Email String email,
                           @NotBlank @Size(min = 8, max = 100) String password,
                           @NotBlank @Size(max = 100) String name) {}
    record UserResponse(UUID id, String email, String name) {}
    public record MembershipDto(UUID boxId, String boxName, String boxSlug, String role) {}
    public record SessionResponse(List<MembershipDto> memberships) {}
    record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

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

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest req) {
        User u = authService.register(req.email(), req.password(), req.name());
        return new UserResponse(u.getId(), u.getEmail(), u.getName());
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        User u = authService.login(req.email(), req.password());
        return withSession(u, http, HttpStatus.OK);
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
