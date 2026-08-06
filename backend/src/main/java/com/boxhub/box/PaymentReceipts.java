package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.Brand;
import com.boxhub.shared.Mailer;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Sends the payment-receipt mail. Callers (the admin-recorded-payment endpoint, the Stripe
 * webhook) must invoke this strictly AFTER their own write transaction has committed — house
 * rule, see SubscriptionTx / StripeWebhookController. This class does no writing itself, so it
 * carries no @Transactional of its own; MembershipRepository.findByIdWithUser join-fetches the
 * user so the lazy User association is safe to read here even though open-in-view is false and
 * no request-scoped session is active by the time this runs.
 */
@Component
public class PaymentReceipts {

    private final Mailer mailer;
    private final MembershipRepository memberships;

    public PaymentReceipts(Mailer mailer, MembershipRepository memberships) {
        this.mailer = mailer;
        this.memberships = memberships;
    }

    public void sendReceipt(Payment payment, Subscription subscription, Plan plan) {
        Membership member = memberships.findByIdWithUser(subscription.getMembershipId()).orElse(null);
        if (member == null || plan == null) return; // defensive — should never happen for a real payment

        // The list price at PAYMENT TIME (Task 1's snapshot column), never the plan's current price
        // — a price rise since must never retroactively paint an old receipt with a discount that
        // was never given. Null (rows written before M12b) means the discount is unknown, not zero.
        Integer listPriceCents = payment.getListPriceCents();
        boolean hasDiscount = listPriceCents != null && listPriceCents - payment.getAmountCents() > 0;

        Map<String, Object> vars = new HashMap<>();
        vars.put("name", member.getUser().getName());
        vars.put("planName", plan.getName());
        vars.put("amountCents", payment.getAmountCents());
        vars.put("currency", payment.getCurrency());
        vars.put("method", payment.getMethod());
        vars.put("listPriceCents", listPriceCents);
        vars.put("hasDiscount", hasDiscount);
        // Must match app.routes.ts's `receipts/:paymentId` route exactly (plural "receipts") —
        // a mismatched path here has previously shipped a dead emailed link.
        vars.put("link", mailer.link("/receipts/" + payment.getId()));

        mailer.send(member.getUser().getEmail(), "Your " + Brand.NAME + " payment receipt", "payment-receipt", vars);
    }

    /** A delayed-notification payment (SEPA debit, bank transfer) bounced. Nothing was granted, so
     *  this is purely informational — factual, no plan/discount detail (the placeholder subscription's
     *  plan may not even be the one the member tried to buy; see StripeWebhookController). */
    public void sendPaymentFailed(Payment payment, Subscription subscription) {
        Membership member = memberships.findByIdWithUser(subscription.getMembershipId()).orElse(null);
        if (member == null) return; // defensive — should never happen for a real payment

        Map<String, Object> vars = new HashMap<>();
        vars.put("name", member.getUser().getName());
        vars.put("amountCents", payment.getAmountCents());
        vars.put("currency", payment.getCurrency());
        vars.put("link", mailer.link("/membership"));

        mailer.send(member.getUser().getEmail(), "Your " + Brand.NAME + " payment did not go through", "payment-failed", vars);
    }
}
