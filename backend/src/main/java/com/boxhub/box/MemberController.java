package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/members")
public class MemberController {

    private static final Set<String> ROLES = Set.of("ATHLETE", "COACH", "BOX_ADMIN");
    private static final Set<String> STATUSES = Set.of("ACTIVE", "SUSPENDED");
    static final int EXPIRING_SOON_DAYS = 14;

    private final MembershipRepository memberships;
    private final PlanRepository plans;

    public MemberController(MembershipRepository memberships, PlanRepository plans) {
        this.memberships = memberships;
        this.plans = plans;
    }

    public record MemberDto(UUID membershipId, UUID userId, String name, String email,
                            String role, String status, UUID planId, String planName,
                            LocalDate expiresAt, boolean expiringSoon) {}

    record PatchMemberRequest(String role, String status, UUID planId, LocalDate expiresAt) {}

    @GetMapping
    public Page<MemberDto> list(@RequestParam(required = false) String search,
                                @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "20") int size) {
        RoleGuard.requireBoxAdmin();
        String s = (search == null || search.isBlank()) ? null : search.trim();
        return memberships.searchByBox(TenantContext.requireBoxId(), s,
                        PageRequest.of(page, Math.min(size, 100)))
                .map(this::toDto);
    }

    @PatchMapping("/{membershipId}")
    @Transactional // keeps the join-fetched user initialized across find+save+toDto in one session
    public MemberDto patch(@PathVariable UUID membershipId, @RequestBody PatchMemberRequest req) {
        RoleGuard.requireBoxAdmin();
        UUID boxId = TenantContext.requireBoxId();
        Membership m = memberships.findByIdAndBoxId(membershipId, boxId)
                .orElseThrow(NoSuchElementException::new);

        if (req.role() != null && !ROLES.contains(req.role()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid role");
        if (req.status() != null && !STATUSES.contains(req.status()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status");

        boolean losesAdmin = "BOX_ADMIN".equals(m.getRole()) && "ACTIVE".equals(m.getStatus())
                && ((req.role() != null && !"BOX_ADMIN".equals(req.role()))
                 || (req.status() != null && !"ACTIVE".equals(req.status())));
        if (losesAdmin && memberships.countByBoxIdAndRoleAndStatus(boxId, "BOX_ADMIN", "ACTIVE") <= 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Cannot remove the last active admin");

        if (req.role() != null) m.setRole(req.role());
        if (req.status() != null) m.setStatus(req.status());
        if (req.planId() != null) m.setPlanId(req.planId());
        if (req.expiresAt() != null) m.setExpiresAt(req.expiresAt());
        return toDto(memberships.save(m));
    }

    private MemberDto toDto(Membership m) {
        String planName = m.getPlanId() == null ? null
                : plans.findById(m.getPlanId()).map(Plan::getName).orElse(null);
        boolean soon = m.getExpiresAt() != null
                && !m.getExpiresAt().isAfter(LocalDate.now().plusDays(EXPIRING_SOON_DAYS));
        return new MemberDto(m.getId(), m.getUser().getId(), m.getUser().getName(),
                m.getUser().getEmail(), m.getRole(), m.getStatus(), m.getPlanId(), planName,
                m.getExpiresAt(), soon);
    }
}
