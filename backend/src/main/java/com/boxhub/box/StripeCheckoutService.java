package com.boxhub.box;

import com.boxhub.shared.AppUrls;
import com.boxhub.shared.CryptoService;
import com.boxhub.shared.TenantContext;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.param.checkout.SessionCreateParams;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

/**
 * Builds a Stripe Checkout Session on the BOX's own restricted key (never the platform's) for the
 * plan's list price — per-user negotiated pricing does not apply online in v1, that's Task 6's
 * admin rail. The box's key/secret never leave decrypt() here; only ciphertext is ever read from
 * BoxStripeRepository and only the resulting Checkout URL/session id leave this class.
 * <p>
 * The PENDING payment's {@code subscription_id} is NOT NULL, so it must reference a real
 * subscription row at creation time even though the paid-for period doesn't exist yet. Resolution:
 * an ACTIVE subscription for the SAME plan is reused (recordPeriod extends that very row on webhook
 * success); an ACTIVE subscription for a DIFFERENT plan is refused up front with
 * SWITCH_REQUIRES_CANCEL. When there is NO active subscription (lapsed/EXPIRED/CANCELED) the member
 * is renewing — the exact flow the lapse email drives — so checkout is allowed and the payment is
 * pointed at the member's most-recent subscription row purely to satisfy the FK; on webhook success
 * recordPeriod reactivates/creates the real subscription and the webhook repoints the payment at it.
 * Every membership has at least one subscription row (V14 grandfather migration / invite-accept), so
 * the fallback resolves; the guarded NO_SUBSCRIPTION path is defence against that invariant breaking.
 */
@Service
public class StripeCheckoutService {

    private final PlanRepository plans;
    private final SubscriptionRepository subscriptions;
    private final PaymentRepository payments;
    private final BoxStripeRepository boxStripe;
    private final CryptoService crypto;
    private final AppUrls appUrls;

    public StripeCheckoutService(PlanRepository plans, SubscriptionRepository subscriptions,
                                  PaymentRepository payments, BoxStripeRepository boxStripe,
                                  CryptoService crypto, AppUrls appUrls) {
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.payments = payments;
        this.boxStripe = boxStripe;
        this.crypto = crypto;
        this.appUrls = appUrls;
    }

    /** Returns the hosted Checkout URL the caller should redirect to. */
    public String createSession(UUID membershipId, UUID planId) {
        UUID boxId = TenantContext.requireBoxId();

        Plan plan = plans.findById(planId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "PLAN_NOT_FOUND"));

        BoxStripe stripeCreds = boxStripe.findByBoxId(boxId)
                .filter(BoxStripe::isEnabled)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "STRIPE_NOT_CONNECTED"));

        // Resolve a subscription id for the PENDING payment (subscription_id is NOT NULL). If the
        // member currently has an ACTIVE subscription it must be for the SAME plan (a mid-period
        // plan switch requires cancelling first — same guard recordPeriod enforces on webhook). If
        // there is NO active subscription (lapsed/EXPIRED/CANCELED), renewal is exactly what Stripe
        // checkout is FOR — the lapse email drives it — so allow it and point the payment at the
        // member's most-recent subscription row; recordPeriod reactivates/creates the real one on
        // webhook success and the webhook then repoints the payment at whatever it actually paid for.
        Optional<Subscription> active = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE");
        UUID paymentSubscriptionId;
        if (active.isPresent()) {
            if (!active.get().getPlanId().equals(planId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "SWITCH_REQUIRES_CANCEL");
            }
            paymentSubscriptionId = active.get().getId();
        } else {
            paymentSubscriptionId = subscriptions.findFirstByMembershipIdOrderByCreatedAtDesc(membershipId)
                    .map(Subscription::getId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "NO_SUBSCRIPTION"));
        }

        Payment payment = new Payment();
        payment.setSubscriptionId(paymentSubscriptionId);
        payment.setAmountCents(plan.getPriceCents());
        payment.setCurrency(plan.getCurrency());
        payment.setMethod("STRIPE");
        payment.setStatus("PENDING");
        payment.setListPriceCents(plan.getPriceCents()); // snapshot — the receipt must never re-price this later
        payment = payments.save(payment);

        String restrictedKey = crypto.decrypt(stripeCreds.getRestrictedKeyEnc());
        RequestOptions requestOptions = RequestOptions.builder().setApiKey(restrictedKey).build();

        SessionCreateParams params = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.PAYMENT)
                .setSuccessUrl(link("/membership?checkout=success"))
                .setCancelUrl(link("/membership?checkout=cancel"))
                .addLineItem(SessionCreateParams.LineItem.builder()
                        .setQuantity(1L)
                        .setPriceData(SessionCreateParams.LineItem.PriceData.builder()
                                .setCurrency(plan.getCurrency())
                                .setUnitAmount((long) plan.getPriceCents())
                                .setProductData(SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                        .setName(plan.getName())
                                        .build())
                                .build())
                        .build())
                // StripeWebhookController reads planId back from this metadata to activate the plan
                // actually purchased — do NOT drop it, or a cross-plan renewal mis-activates.
                .putMetadata("boxId", boxId.toString())
                .putMetadata("membershipId", membershipId.toString())
                .putMetadata("planId", planId.toString())
                .putMetadata("paymentId", payment.getId().toString())
                .build();

        Session session;
        try {
            session = Session.create(params, requestOptions);
        } catch (StripeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "STRIPE_CHECKOUT_FAILED", e);
        }

        payment.setStripeSessionId(session.getId());
        payments.save(payment);

        return session.getUrl();
    }

    /** Absolute link into the SPA, same convention as Mailer.link(). */
    private String link(String path) {
        return appUrls.appLink(path);
    }
}
