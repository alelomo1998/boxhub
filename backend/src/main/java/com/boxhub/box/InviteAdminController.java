package com.boxhub.box;

import com.boxhub.shared.AppUrls;
import com.boxhub.shared.Brand;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/invites")
public class InviteAdminController {

    private final InviteRepository invites;
    private final InviteService inviteService;
    private final PlanRepository plans;
    private final BoxRepository boxes;
    private final Mailer mailer;
    private final AppUrls appUrls;

    public InviteAdminController(InviteRepository invites, InviteService inviteService, PlanRepository plans,
                                  BoxRepository boxes, Mailer mailer, AppUrls appUrls) {
        this.invites = invites;
        this.inviteService = inviteService;
        this.plans = plans;
        this.boxes = boxes;
        this.mailer = mailer;
        this.appUrls = appUrls;
    }

    /** email redacted — Spring MVC logs the deserialized request body at DEBUG; see
     *  AuthController.RegisterRequest for the full note. A member's address is PII, and the log
     *  has no retention policy. */
    record CreateInviteRequest(@NotBlank @Email String email,
                               @NotBlank @Pattern(regexp = "ATHLETE|COACH|BOX_ADMIN") String role,
                               UUID planId) {
        @Override public String toString() {
            return "CreateInviteRequest[email=***, role=" + role + ", planId=" + planId + "]";
        }
    }

    /** {@code link} embeds the raw invite token — a single-use credential that grants membership.
     *  toString() redacts it because Spring MVC logs the response body at DEBUG
     *  ({@code Writing [<return value>]}); see AuthController.RegisterRequest for the full note. */
    record CreatedInviteResponse(UUID id, String email, String role, UUID planId,
                                 Instant expiresAt, String link) {
        @Override public String toString() {
            return "CreatedInviteResponse[id=" + id + ", email=***, role=" + role
                    + ", planId=" + planId + ", expiresAt=" + expiresAt + ", link=***]";
        }
    }

    record InviteDto(UUID id, String email, String role, UUID planId, Instant expiresAt) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedInviteResponse create(@Valid @RequestBody CreateInviteRequest req) {
        RoleGuard.requireBoxAdmin();
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow(NoSuchElementException::new);
        BoxStatusGuard.requireActive(box);
        if (req.planId() != null && plans.findById(req.planId()).isEmpty())
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown plan");
        var created = inviteService.create(req.email(), req.role(), req.planId());
        Invite i = created.invite();
        mailer.send(i.getEmail(), box.getName() + " invited you to " + Brand.NAME, "invite",
                Map.of("boxName", box.getName(), "role", i.getRole(),
                        "link", mailer.link("/join/" + created.rawToken())));
        return new CreatedInviteResponse(i.getId(), i.getEmail(), i.getRole(), i.getPlanId(),
                i.getExpiresAt(), appUrls.appPath("/join/" + created.rawToken()));
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
