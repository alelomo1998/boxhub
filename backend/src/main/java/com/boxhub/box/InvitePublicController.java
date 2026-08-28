package com.boxhub.box;

import com.boxhub.identity.AuthController;
import com.boxhub.shared.TenantContext;
import org.springframework.web.bind.annotation.*;

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

    public InvitePublicController(InviteService inviteService, InviteAcceptTx acceptTx,
                                  BoxRepository boxes, PlanRepository plans,
                                  SubscriptionService subscriptionService,
                                  MembershipEventRepository membershipEvents) {
        this.inviteService = inviteService;
        this.acceptTx = acceptTx;
        this.boxes = boxes;
        this.plans = plans;
        this.subscriptionService = subscriptionService;
        this.membershipEvents = membershipEvents;
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
            });
        } else {
            // A plan-less invite (planId null) means the box bills this member offline — but they
            // still need to be bookable, so comp them onto the per-box synthetic "Comped" plan
            // (M12b Task 2) instead of leaving them without any subscription at all.
            TenantContext.runAsBox(r.box().getId(), () -> {
                subscriptionService.comp(r.membership().getId());
                membershipEvents.save(new MembershipEvent(r.membership().getId(), MembershipEvent.JOINED, null, null));
            });
        }

        Box box = r.box();
        return new AuthController.MembershipDto(box.getId(), box.getName(), box.getSlug(), r.membership().getRole(), box.getStatus());
    }
}
