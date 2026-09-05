package com.boxhub.box;

import com.boxhub.identity.AuthController;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.notify.NotificationService;
import com.boxhub.notify.NotificationType;
import com.boxhub.shared.TenantContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/invites")
public class InvitePublicController {

    private final InviteService inviteService;
    private final InviteAcceptTx acceptTx;
    private final BoxRepository boxes;
    private final PlanRepository plans;
    private final SubscriptionService subscriptionService;
    private final MembershipEventRepository membershipEvents;
    private final MembershipRepository memberships;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public InvitePublicController(InviteService inviteService, InviteAcceptTx acceptTx,
                                  BoxRepository boxes, PlanRepository plans,
                                  SubscriptionService subscriptionService,
                                  MembershipEventRepository membershipEvents,
                                  MembershipRepository memberships, NotificationService notifications,
                                  PlatformTransactionManager txManager) {
        this.inviteService = inviteService;
        this.acceptTx = acceptTx;
        this.boxes = boxes;
        this.plans = plans;
        this.subscriptionService = subscriptionService;
        this.membershipEvents = membershipEvents;
        this.memberships = memberships;
        this.notifications = notifications;
        this.tx = new TransactionTemplate(txManager);
    }

    record PreviewResponse(String boxName, String boxSlug, String role, String email, String planName) {}

    @GetMapping("/{token}")
    public PreviewResponse preview(@PathVariable String token) {
        Invite inv = inviteService.findValid(token);
        Box box = boxes.findById(inv.getBoxId()).orElseThrow(NoSuchElementException::new);
        // Plan is @TenantId; this permitAll endpoint can be hit with an ambient JWT for a
        // DIFFERENT box already in the SecurityContext (e.g. cookie from a box-admin's own
        // dashboard tab). An unguarded plans.findById would then silently filter to that
        // wrong tenant and return empty -> planName always null for a cross-box preview.
        // Same trap as StripeWebhookController/SessionGenerator (see CLAUDE.md); fix is the
        // same runAsBox pattern accept() already uses below.
        String planName = inv.getPlanId() == null ? null
                : TenantContext.runAsBox(inv.getBoxId(), () -> plans.findById(inv.getPlanId()).map(Plan::getName).orElse(null));
        return new PreviewResponse(box.getName(), box.getSlug(), inv.getRole(), inv.getEmail(), planName);
    }

    /**
     * NOT @Transactional here, deliberately: membership creation (acceptTx.accept, its own
     * transaction, safe under the accepting user's tenant-less token — Invite reads/burns are
     * native, Membership isn't @TenantId) must fully commit BEFORE the subscription is created,
     * because Subscription IS @TenantId and needs the box's real tenant on the Hibernate
     * session/transaction that creates it — setting the tenant mid-transaction is a no-op (see
     * SessionGenerator's documented ordering requirement). Doing both in one @Transactional method
     * would open that single session under the wrong (NO_TENANT) identity for its entire life.
     * So: commit the membership first, then run the subscription creation as its own, later
     * transaction, with the tenant established (runAsBox) before that transaction opens.
     */
    @PostMapping("/{token}/accept")
    public AuthController.MembershipDto accept(@PathVariable String token) {
        UUID userId = TenantContext.userId();
        InviteAcceptTx.Result r = acceptTx.accept(token, userId);

        if (r.invite().getPlanId() != null) {
            TenantContext.runAsBox(r.box().getId(), () -> {
                Plan plan = plans.findById(r.invite().getPlanId()).orElseThrow(NoSuchElementException::new);
                // No Payment row — they haven't paid. ACTIVE with a concrete period end so the
                // entitlement check lets them book immediately; the lapse job chases them later.
                subscriptionService.recordPeriod(r.membership().getId(), plan.getId(), plan.getPriceCents(), null);
                membershipEvents.save(new MembershipEvent(r.membership().getId(), MembershipEvent.JOINED, null, null));
                tx.executeWithoutResult(status -> notifyAdmins(NotificationType.INVITE_ACCEPTED,
                        r.membership().getId(),
                        Map.of(NotificationType.INVITEE_NAME, r.membership().getUser().getName())));
            });
        } else {
            // A plan-less invite (planId null) means the box bills this member offline — but they
            // still need to be bookable, so comp them onto the per-box synthetic "Comped" plan
            // (M12b Task 2) instead of leaving them without any subscription at all.
            TenantContext.runAsBox(r.box().getId(), () -> {
                subscriptionService.comp(r.membership().getId());
                membershipEvents.save(new MembershipEvent(r.membership().getId(), MembershipEvent.JOINED, null, null));
                tx.executeWithoutResult(status -> notifyAdmins(NotificationType.INVITE_ACCEPTED,
                        r.membership().getId(),
                        Map.of(NotificationType.INVITEE_NAME, r.membership().getUser().getName())));
            });
        }

        Box box = r.box();
        return new AuthController.MembershipDto(box.getId(), box.getName(), box.getSlug(), r.membership().getRole(), box.getStatus());
    }

    /**
     * Staff-facing events go to every ACTIVE box admin EXCEPT the person who caused them. Membership
     * carries no @TenantId discriminator, so the box predicate is explicit.
     *
     * <p>The exclusion is not defensive: an invite may itself carry the BOX_ADMIN role, and the
     * acceptor is already an ACTIVE admin by the time this runs — so without it, accepting an
     * admin invite would tell you that you accepted your own invite. A notification for an action
     * you just performed is the noise NOTIFICATIONS.md §5.3 exists to prevent.
     */
    private void notifyAdmins(NotificationType type, UUID actorMembershipId, Map<String, Object> params) {
        List<UUID> admins = memberships
                .findByBoxIdAndRoleAndStatus(TenantContext.requireBoxId(), "BOX_ADMIN", "ACTIVE")
                .stream().map(Membership::getId)
                .filter(id -> !id.equals(actorMembershipId))
                .toList();
        notifications.emitAll(type, admins, params);
    }
}
