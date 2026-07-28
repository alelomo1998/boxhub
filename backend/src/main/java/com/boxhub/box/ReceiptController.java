package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * A single payment's receipt. Payment/Subscription/Plan are all @TenantId, so
 * PaymentRepository#findById is already box-scoped — a foreign-box paymentId looks absent (404),
 * same as MemberController's cross-tenant convention. On top of tenant scoping, this is
 * member-visible data, so it also needs a per-row authorization check: only the member who was
 * actually billed (subscription.membershipId) or a box admin may read it.
 */
@RestController
@RequestMapping("/api/box/receipts")
public class ReceiptController {

    private final PaymentRepository payments;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final BoxRepository boxes;
    private final MembershipRepository memberships;

    public ReceiptController(PaymentRepository payments, SubscriptionRepository subscriptions,
                              PlanRepository plans, BoxRepository boxes, MembershipRepository memberships) {
        this.payments = payments;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.boxes = boxes;
        this.memberships = memberships;
    }

    record ReceiptDto(UUID paymentId, int amountCents, String currency, String method, String planName,
                       Instant periodStart, Instant periodEnd, Integer listPriceCents, Integer discountCents,
                       String boxName, Instant createdAt) {}

    @GetMapping("/{paymentId}")
    public ReceiptDto get(@PathVariable UUID paymentId) {
        UUID boxId = TenantContext.requireBoxId();
        Payment payment = payments.findById(paymentId).orElseThrow(NoSuchElementException::new);
        Subscription sub = subscriptions.findById(payment.getSubscriptionId()).orElseThrow(NoSuchElementException::new);

        Membership caller = memberships.findByUserIdAndBoxId(TenantContext.userId(), boxId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "NO_MEMBERSHIP"));
        boolean isAdmin = "BOX_ADMIN".equals(caller.getRole());
        boolean isPayer = caller.getId().equals(sub.getMembershipId());
        if (!isAdmin && !isPayer) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "NOT_YOUR_RECEIPT");

        Plan plan = plans.findById(sub.getPlanId()).orElseThrow(NoSuchElementException::new);
        Box box = boxes.findById(boxId).orElseThrow(NoSuchElementException::new);
        // The list price at PAYMENT TIME, never the plan's current price — a price rise since must
        // never retroactively paint an old receipt with a discount that was never given. Null (rows
        // written before M12b) means the discount is unknown, not zero: omit it entirely.
        Integer listPriceCents = payment.getListPriceCents();
        Integer discountCents = listPriceCents == null ? null : Math.max(0, listPriceCents - payment.getAmountCents());

        return new ReceiptDto(payment.getId(), payment.getAmountCents(), payment.getCurrency(),
                payment.getMethod(), plan.getName(), sub.getCurrentPeriodStart(), sub.getCurrentPeriodEnd(),
                listPriceCents, discountCents, box.getName(), payment.getCreatedAt());
    }
}
