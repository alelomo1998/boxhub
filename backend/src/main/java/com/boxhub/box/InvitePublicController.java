package com.boxhub.box;

import com.boxhub.identity.AuthController;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/invites")
public class InvitePublicController {

    private final InviteService inviteService;
    private final InviteRepository invites;
    private final BoxRepository boxes;
    private final PlanRepository plans;
    private final MembershipRepository memberships;
    private final UserRepository users;

    public InvitePublicController(InviteService inviteService, InviteRepository invites,
                                  BoxRepository boxes, PlanRepository plans,
                                  MembershipRepository memberships, UserRepository users) {
        this.inviteService = inviteService;
        this.invites = invites;
        this.boxes = boxes;
        this.plans = plans;
        this.memberships = memberships;
        this.users = users;
    }

    record PreviewResponse(String boxName, String boxSlug, String role, String email, String planName) {}

    @GetMapping("/{token}")
    public PreviewResponse preview(@PathVariable String token) {
        Invite inv = inviteService.findValid(token);
        Box box = boxes.findById(inv.getBoxId()).orElseThrow(NoSuchElementException::new);
        String planName = inv.getPlanId() == null ? null
                : plans.findById(inv.getPlanId()).map(Plan::getName).orElse(null);
        return new PreviewResponse(box.getName(), box.getSlug(), inv.getRole(), inv.getEmail(), planName);
    }

    @PostMapping("/{token}/accept")
    @Transactional
    public AuthController.MembershipDto accept(@PathVariable String token) {
        UUID userId = TenantContext.userId();
        Invite inv = inviteService.findValid(token);
        if (memberships.findByUserIdAndBoxId(userId, inv.getBoxId()).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already a member of this box");

        // Atomic single-use burn: the row-level lock serializes concurrent accepts;
        // losers see 0 rows and get 410. Rolls back with the membership on failure.
        if (invites.burnIfUnaccepted(inv.getId(), Instant.now()) == 0)
            throw new ResponseStatusException(HttpStatus.GONE, "Invite expired or already used");

        Box box = boxes.findById(inv.getBoxId()).orElseThrow(NoSuchElementException::new);
        User user = users.findById(userId).orElseThrow(NoSuchElementException::new);
        Membership m = new Membership();
        m.setUser(user);
        m.setBox(box);
        m.setRole(inv.getRole());
        if (inv.getPlanId() != null) {
            Plan plan = plans.findById(inv.getPlanId()).orElse(null);
            if (plan != null) {
                m.setPlanId(plan.getId());
                m.setExpiresAt(LocalDate.now().plusDays(plan.getDurationDays()));
            }
        }
        try {
            memberships.saveAndFlush(m);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already a member of this box");
        }
        return new AuthController.MembershipDto(box.getId(), box.getName(), box.getSlug(), m.getRole(), box.getStatus());
    }
}
