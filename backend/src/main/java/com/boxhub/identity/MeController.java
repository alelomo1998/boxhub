package com.boxhub.identity;

import com.boxhub.shared.TenantContext;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class MeController {

    private final UserRepository users;
    private final AuthService authService;

    public MeController(UserRepository users, AuthService authService) {
        this.users = users;
        this.authService = authService;
    }

    record MeResponse(UUID id, String email, String name, boolean superadmin,
                      List<AuthController.MembershipDto> memberships) {}

    @GetMapping("/api/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        User u = users.findById(TenantContext.userId()).orElseThrow();
        var mems = authService.membershipsOf(u).stream()
                .map(m -> new AuthController.MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole(), m.getBox().getStatus()))
                .toList();
        boolean superadmin = jwt != null && Boolean.TRUE.equals(jwt.getClaim("superadmin"));
        return new MeResponse(u.getId(), u.getEmail(), u.getName(), superadmin, mems);
    }
}
