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

    public AuthController(AuthService authService, TokenService tokenService, RefreshTokenService refreshTokens) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.refreshTokens = refreshTokens;
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
}
