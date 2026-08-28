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

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.NoSuchElementException;
import java.util.Optional;
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
    private final SubscriptionService subscriptions;
    private final MembershipEventRepository membershipEvents;

    public MemberController(MembershipRepository memberships, PlanRepository plans, SubscriptionService subscriptions,
                            MembershipEventRepository membershipEvents) {
        this.memberships = memberships;
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.membershipEvents = membershipEvents;
    }

    public record MemberDto(UUID membershipId, UUID userId, String name, String email,
                            String role, String status, UUID planId, String planName,
                            UUID subscriptionId, LocalDate expiresAt, boolean expiringSoon) {}

    // No expiresAt: M10 moved expiry onto the active subscription, so writing the membership
    // column would be silently ignored by every surface that reads it — the same dead-field
    // defect planId had before T6 removed it. Expiry changes go through a subscription period.
    record PatchMemberRequest(String role, String status) {}

    @GetMapping
    public Page<MemberDto> list(@RequestParam(required = false) String search,
                                @RequestParam(defaultValue = "0") int page,
                                @RequestParam(defaultValue = "20") int size) {
        RoleGuard.requireBoxAdmin();
        String s = (search == null || search.isBlank()) ? null : search.trim();
        return memberships.searchByBox(TenantContext.requireBoxId(), s,
                        PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)))
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
        if (losesAdmin) RoleGuard.assertNotLastAdmin(memberships, boxId);

        // Emit only on an ACTUAL transition — a no-op PATCH (status already what was requested)
        // writes nothing. The two directions this endpoint can cause; JOINED/LEFT are never
        // written from here (see MembershipEvent's javadoc).
        String previousStatus = m.getStatus();
        if (req.status() != null && !previousStatus.equals(req.status())) {
            String kind = "SUSPENDED".equals(req.status()) ? MembershipEvent.SUSPENDED
                    : "ACTIVE".equals(req.status()) ? MembershipEvent.REACTIVATED : null;
            if (kind != null) {
                UUID actorMembershipId = memberships.findByUserIdAndBoxId(TenantContext.userId(), boxId)
                        .map(Membership::getId).orElse(null);
                membershipEvents.save(new MembershipEvent(m.getId(), kind, actorMembershipId, null));
            }
        }

        if (req.role() != null) m.setRole(req.role());
        if (req.status() != null) m.setStatus(req.status());
        return toDto(memberships.save(m));
    }

    private MemberDto toDto(Membership m) {
        // Plan assignment AND expiry live on the membership's active Subscription (M10), not on
        // Membership.expiresAt — nothing writes that column any more (recordPeriod, invite accept,
        // the webhook and the lapse job all write Subscription.currentPeriodEnd instead), so it is
        // permanently stale. No active subscription (never assigned, or lapsed) means null/false,
        // correctly; a grandfathered subscription (null currentPeriodEnd) never counts as expiring.
        UUID planId = null;
        String planName = null;
        UUID subscriptionId = null;
        LocalDate expiresAt = null;
        Optional<Subscription> active = subscriptions.activeFor(m.getId());
        if (active.isPresent()) {
            Subscription sub = active.get();
            planId = sub.getPlanId();
            planName = plans.findById(planId).map(Plan::getName).orElse(null);
            subscriptionId = sub.getId();
            Instant end = sub.getCurrentPeriodEnd();
            if (end != null) expiresAt = end.atZone(ZoneId.systemDefault()).toLocalDate();
        }
        boolean soon = expiresAt != null && !expiresAt.isAfter(LocalDate.now().plusDays(EXPIRING_SOON_DAYS));
        return new MemberDto(m.getId(), m.getUser().getId(), m.getUser().getName(),
                m.getUser().getEmail(), m.getRole(), m.getStatus(), planId, planName,
                subscriptionId, expiresAt, soon);
    }
}
