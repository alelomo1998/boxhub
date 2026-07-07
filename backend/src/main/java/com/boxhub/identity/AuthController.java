package com.boxhub.identity;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokens;
    private final MembershipRepository membershipRepo;
    private final UserRepository userRepo;

    public AuthController(AuthService authService, TokenService tokenService, RefreshTokenService refreshTokens,
                           MembershipRepository membershipRepo, UserRepository userRepo) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.refreshTokens = refreshTokens;
        this.membershipRepo = membershipRepo;
        this.userRepo = userRepo;
    }

    record RegisterRequest(@NotBlank @Email String email,
                           @NotBlank @Size(min = 8, max = 100) String password,
                           @NotBlank @Size(max = 100) String name) {}

    record UserResponse(UUID id, String email, String name) {}

    public record MembershipDto(UUID boxId, String boxName, String boxSlug, String role) {}
    public record TokenPairResponse(String accessToken, String refreshToken,
                                    java.util.List<MembershipDto> memberships) {}
    record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest req) {
        User u = authService.register(req.email(), req.password(), req.name());
        return new UserResponse(u.getId(), u.getEmail(), u.getName());
    }

    @PostMapping("/login")
    public TokenPairResponse login(@Valid @RequestBody LoginRequest req) {
        User u = authService.login(req.email(), req.password());
        var mems = authService.membershipsOf(u).stream()
                .map(m -> new MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
        return new TokenPairResponse(tokenService.userToken(u), refreshTokens.issue(u), mems);
    }

    record RefreshRequest(@NotBlank String refreshToken) {}

    @PostMapping("/refresh")
    public TokenPairResponse refresh(@Valid @RequestBody RefreshRequest req) {
        User u = refreshTokens.consume(req.refreshToken());
        var mems = authService.membershipsOf(u).stream()
                .map(m -> new MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
        return new TokenPairResponse(tokenService.userToken(u), refreshTokens.issue(u), mems);
    }

    record BoxTokenRequest(@jakarta.validation.constraints.NotNull UUID boxId) {}
    record BoxTokenResponse(String accessToken) {}

    @PostMapping("/box-token")
    public BoxTokenResponse boxToken(@Valid @RequestBody BoxTokenRequest req) {
        UUID userId = com.boxhub.shared.TenantContext.userId();
        Membership m = membershipRepo.findByUserIdAndBoxId(userId, req.boxId())
                .filter(mem -> "ACTIVE".equals(mem.getStatus()))
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "No active membership in this box"));
        User u = userRepo.findById(userId).orElseThrow();
        return new BoxTokenResponse(tokenService.boxToken(u, m));
    }
}
