package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/invites")
public class InviteAdminController {

    private final InviteRepository invites;
    private final InviteService inviteService;
    private final PlanRepository plans;

    public InviteAdminController(InviteRepository invites, InviteService inviteService, PlanRepository plans) {
        this.invites = invites;
        this.inviteService = inviteService;
        this.plans = plans;
    }

    record CreateInviteRequest(@NotBlank @Email String email,
                               @NotBlank @Pattern(regexp = "ATHLETE|COACH|BOX_ADMIN") String role,
                               UUID planId) {}

    record CreatedInviteResponse(UUID id, String email, String role, UUID planId,
                                 Instant expiresAt, String link) {}

    record InviteDto(UUID id, String email, String role, UUID planId, Instant expiresAt) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedInviteResponse create(@Valid @RequestBody CreateInviteRequest req) {
        RoleGuard.requireBoxAdmin();
        if (req.planId() != null && plans.findById(req.planId()).isEmpty())
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown plan");
        var created = inviteService.create(req.email(), req.role(), req.planId());
        Invite i = created.invite();
        return new CreatedInviteResponse(i.getId(), i.getEmail(), i.getRole(), i.getPlanId(),
                i.getExpiresAt(), "/join/" + created.rawToken());
    }

    @GetMapping
    public List<InviteDto> pending() {
        RoleGuard.requireBoxAdmin();
        Instant now = Instant.now();
        return invites.findAll().stream()
                .filter(i -> i.getAcceptedAt() == null && i.getExpiresAt().isAfter(now))
                .map(i -> new InviteDto(i.getId(), i.getEmail(), i.getRole(), i.getPlanId(), i.getExpiresAt()))
                .toList();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable UUID id) {
        RoleGuard.requireBoxAdmin();
        Invite i = invites.findById(id).orElseThrow(NoSuchElementException::new);
        invites.delete(i);
    }
}
