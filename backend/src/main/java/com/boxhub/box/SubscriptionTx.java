package com.boxhub.box;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Transactional unit behind SubscriptionController's admin-recorded-payment endpoint. House rule:
 * mail fires strictly after commit, never from inside an open transaction (same precedent as
 * BoxLifecycleTx). This bean does the DB work — extend/create the subscription period, write the
 * Payment row — and returns everything PaymentReceipts needs. The controller calls through this
 * bean's proxy, lets the transaction commit, and only then sends the receipt mail. Package-private
 * — plumbing for SubscriptionController, not a public API.
 */
@Component
class SubscriptionTx {

    private final SubscriptionService subscriptions;
    private final PaymentRepository payments;
    private final PlanRepository plans;

    SubscriptionTx(SubscriptionService subscriptions, PaymentRepository payments, PlanRepository plans) {
        this.subscriptions = subscriptions;
        this.payments = payments;
        this.plans = plans;
    }

    record Recorded(Subscription subscription, Payment payment, Plan plan) {}

    @Transactional
    Recorded recordAdminPayment(UUID membershipId, UUID planId, String method, int priceCents,
                                 String priceNote, String reference, UUID recordedByMembershipId) {
        Subscription sub = subscriptions.recordPeriod(membershipId, planId, priceCents, priceNote);
        Plan plan = plans.findById(planId).orElseThrow();

        Payment p = new Payment();
        p.setSubscriptionId(sub.getId());
        p.setAmountCents(priceCents);
        p.setCurrency(plan.getCurrency());
        p.setMethod(method);
        p.setStatus("SUCCEEDED");
        p.setRecordedBy(recordedByMembershipId);
        p.setReference(reference);
        p.setListPriceCents(plan.getPriceCents()); // snapshot — the receipt must never re-price this later
        p = payments.save(p);

        return new Recorded(sub, p, plan);
    }
}
