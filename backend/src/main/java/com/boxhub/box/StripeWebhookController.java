package com.boxhub.box;

import com.boxhub.shared.CryptoService;
import com.boxhub.shared.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Stripe calls this endpoint with no JWT and no box scope — permitAll + CSRF-exempt in
 * SecurityConfig (see the CSRF_EXEMPT_PATHS note there). The entire security boundary is the
 * Stripe-Signature check against THAT box's own decrypted webhook secret; nothing else protects
 * this endpoint, so verification never happens "later" or "maybe" — every code path either
 * verifies before writing anything, or writes nothing.
 * <p>
 * <b>Tenant-less-on-a-@TenantId-domain (gotcha #1).</b> Payment/Subscription/Plan are all
 * {@code @TenantId}; with no ambient tenant, a derived/JPQL query silently filters to the
 * all-zeros root tenant and finds nothing (this bit the invite feature twice — see CLAUDE.md).
 * {@link PaymentRepository#findByStripeSessionId} is therefore {@code @Query(nativeQuery = true)},
 * and it does double duty here: it is both the tenant-less lookup AND the box-resolution step —
 * the box for a given event is read from that Payment row's own {@code box_id} column, not from
 * the (unverified, pre-signature-check) event JSON. This is a deliberate deviation from "resolve
 * the box from event metadata.boxId": trusting our own DB row is strictly more robust than trusting
 * an unverified JSON field for routing, and it collapses "no such session id" and "irrelevant event
 * type" into the exact same safe 200-no-op path the brief requires, with zero JSON metadata
 * parsing needed. Once the box is known, everything that touches a {@code @TenantId} entity
 * (Subscription/Plan reads via SubscriptionService, the Payment status update) runs inside
 * {@code TenantContext.runAsBox(boxId, ...)} — since M21 the single shared implementation: a synthetic
 * box-scoped Authentication is installed BEFORE the transaction opens — {@code SessionGenerator}'s
 * documented trap is that @TenantId resolves to the NO_TENANT sentinel (and inserts then throw an
 * FK violation on {@code box_id}) if the tenant is set only after the Hibernate session/tx has
 * already started, so the {@code runAsBox(boxId, () -> tx.executeWithoutResult(...))} nesting
 * order below is load-bearing, not stylistic.
 */
@RestController
public class StripeWebhookController {

    private static final Logger log = LoggerFactory.getLogger(StripeWebhookController.class);

    private static final String CHECKOUT_COMPLETED = "checkout.session.completed";
    // A delayed-notification payment method (SEPA direct debit, bank transfer — one dashboard
    // toggle on a EUR account, and Plan.currency defaults to "eur") completes the SESSION
    // immediately but leaves payment_status "unpaid"; Stripe settles days later via this event,
    // or fails via async_payment_failed (not handled here — falls through to the type no-op below,
    // same as any other irrelevant event, leaving the payment PENDING forever, which is correct:
    // nothing was ever granted). Both accepted types are gated on payment_status "paid" below so
    // a member is only ever granted a subscription/receipt once the money actually settled.
    private static final String ASYNC_PAYMENT_SUCCEEDED = "checkout.session.async_payment_succeeded";
    // The delayed rail's other outcome: the debit/transfer bounces instead of settling. Nothing was
    // ever granted (payment_status never reached "paid"), so there is nothing to undo — but the row
    // must stop being PENDING forever, and the member must be told, or they sit believing they're
    // subscribed until a booking fails. No payment_status gating needed here: this event type IS the
    // terminal outcome, independent of whatever payment_status the object carries.
    private static final String ASYNC_PAYMENT_FAILED = "checkout.session.async_payment_failed";
    /**
     * Money going back out. Its {@code data.object} is a CHARGE, not a checkout session, which is
     * why routing had to gain a second key — see the lookup below. Recording only: refund MAIL and
     * any admin-initiated refund flow are M16c's, so this adds no route.
     */
    private static final String CHARGE_REFUNDED = "charge.refunded";
    private static final String PAID = "paid";
    private static final String SUCCEEDED = "succeeded";

    private final PaymentRepository payments;
    private final RefundRepository refunds;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final BoxStripeRepository boxStripe;
    private final SubscriptionService subscriptionService;
    private final PaymentReceipts receipts;
    private final CryptoService crypto;
    private final TransactionTemplate tx;
    private final ObjectMapper json = new ObjectMapper();

    public StripeWebhookController(PaymentRepository payments, RefundRepository refunds,
                                    SubscriptionRepository subscriptions,
                                    PlanRepository plans, BoxStripeRepository boxStripe,
                                    SubscriptionService subscriptionService, PaymentReceipts receipts,
                                    CryptoService crypto, PlatformTransactionManager txManager) {
        this.payments = payments;
        this.refunds = refunds;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.boxStripe = boxStripe;
        this.subscriptionService = subscriptionService;
        this.receipts = receipts;
        this.crypto = crypto;
        this.tx = new TransactionTemplate(txManager);
    }

    /** What sendReceipt() needs, carried out of the transaction so the mail can fire after commit. */
    private record ReceiptData(Payment payment, Subscription subscription, Plan plan) {}

    /** What sendPaymentFailed() needs, carried out of the transaction so the mail can fire after commit. */
    private record FailureData(Payment payment, Subscription subscription) {}

    @PostMapping("/api/stripe/webhook")
    public ResponseEntity<Void> webhook(HttpServletRequest request,
                                         @RequestHeader(value = "Stripe-Signature", required = false) String sigHeader)
            throws IOException {
        // Exact raw bytes, read directly off the request — never through a converter that could
        // re-serialize (and so silently invalidate) the payload the signature was computed over.
        byte[] raw = request.getInputStream().readAllBytes();
        String payload = new String(raw, StandardCharsets.UTF_8);

        if (sigHeader == null || sigHeader.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        JsonNode root;
        try {
            root = json.readTree(payload);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }

        // Used ONLY as an opaque DB lookup key at this point — not trusted for anything until the
        // signature check below passes.
        String sessionId = root.path("data").path("object").path("id").asText(null);
        // charge.refunded's data.object is a CHARGE: its id is ch_... and will never match a cs_...
        // session id, so routing needs a second key. Both the charge and the completed session carry
        // the PaymentIntent, and the success branch below stores it. Still an OPAQUE DB lookup key,
        // exactly like sessionId — nothing here is trusted until the signature check, and the box is
        // still resolved from OUR OWN row, never from the event payload.
        String intentId = root.path("data").path("object").path("payment_intent").asText(null);
        if (sessionId == null && intentId == null) {
            return ResponseEntity.ok().build(); // nothing we can route — no-op, don't leak
        }

        Payment routed = sessionId == null ? null : payments.findByStripeSessionId(sessionId).orElse(null);
        if (routed == null && intentId != null) {
            routed = payments.findByStripePaymentIntentId(intentId).orElse(null);
        }
        if (routed == null) {
            // Unknown to us — same 200 as every other unroutable event. Indistinguishable on purpose:
            // a differing status would turn this endpoint into an existence oracle over Stripe ids.
            return ResponseEntity.ok().build();
        }
        final Payment payment = routed;
        UUID boxId = payment.getBoxId();

        BoxStripe creds = boxStripe.findByBoxId(boxId).orElse(null);
        if (creds == null || !creds.isEnabled()) {
            // 200, not 400: this caller is unauthenticated, so a status that differs from the
            // unknown-session-id 200 above would turn the endpoint into an existence oracle over
            // Stripe session ids. Both "I have never heard of this session" and "I have, but that
            // box has no credentials to verify against" must be indistinguishable. Nothing is
            // written on either path.
            // Logged because the response cannot signal it: Stripe treats 200 as delivered and
            // never retries, so this payment stays PENDING forever with no other operator signal.
            // Box id only — never the credentials or the session id.
            log.warn("stripe webhook for box {} has no usable credentials; payment left PENDING", boxId);
            return ResponseEntity.ok().build();
        }
        String secret = crypto.decrypt(creds.getWebhookSecretEnc());

        try {
            Webhook.constructEvent(payload, sigHeader, secret);
        } catch (SignatureVerificationException e) {
            return ResponseEntity.badRequest().build(); // forged/mismatched — nothing written
        }

        String type = root.path("type").asText(null);

        if (ASYNC_PAYMENT_FAILED.equals(type)) {
            FailureData failure = TenantContext.runAsBox(boxId, () -> tx.execute(status -> {
                Payment p = payments.findByStripeSessionId(sessionId).orElse(null);
                // Only a still-PENDING row is actionable. Already FAILED (a Stripe retry) or already
                // SUCCEEDED (this specific session settling first, however unlikely) is a no-op — no
                // second write, no second email. Idempotency is a property of the row, not a cache.
                if (p == null || !"PENDING".equals(p.getStatus())) {
                    return null;
                }
                Subscription sub = subscriptions.findById(p.getSubscriptionId()).orElseThrow();
                p.setStatus("FAILED");
                payments.save(p);
                return new FailureData(p, sub);
            }));

            // House rule: mail fires strictly after commit, never from inside the transaction above.
            if (failure != null) {
                receipts.sendPaymentFailed(failure.payment(), failure.subscription());
            }
            return ResponseEntity.ok().build();
        }

        if (CHARGE_REFUNDED.equals(type)) {
            final UUID paymentId = payment.getId();
            final String fallbackCurrency = payment.getCurrency();
            final int paidCents = payment.getAmountCents();
            TenantContext.runAsBox(boxId, () -> tx.execute(status -> {
                // A charge carries ALL its refunds, not just the new one, so every retry replays the
                // whole list. stripe_refund_id is UNIQUE and checked here, which is what makes this
                // idempotent — the same "idempotency is a property of the row" rule the branches
                // above follow.
                int already = refunds.findByPaymentId(paymentId).stream().mapToInt(Refund::getAmountCents).sum();
                for (JsonNode r : root.path("data").path("object").path("refunds").path("data")) {
                    String refundId = r.path("id").asText(null);
                    if (refundId == null) continue;
                    // Only settled money. A pending or failed refund is not money back yet, and
                    // Stripe will send another event when it becomes one.
                    if (!SUCCEEDED.equals(r.path("status").asText(null))) continue;
                    if (refunds.findByStripeRefundId(refundId).isPresent()) continue;
                    int amount = r.path("amount").asInt(0);
                    if (amount <= 0) continue; // the DB check forbids it and it means nothing
                    if (already + amount > paidCents) {
                        // Refusing to record more than was ever paid keeps the ledger sane, and the
                        // log is the only way an operator learns our record and Stripe's disagree.
                        // Payment id only — never amounts tied to a person, never Stripe ids.
                        log.warn("stripe refund for payment {} would exceed the amount paid; not recorded", paymentId);
                        continue;
                    }
                    already += amount;
                    refunds.save(new Refund(paymentId, amount,
                            r.path("currency").asText(fallbackCurrency),
                            r.path("reason").asText(null), refundId, null, null));
                }
                return null;
            }));
            // Deliberately no mail: refund messaging and the admin-facing refund flow are M16c's.
            return ResponseEntity.ok().build();
        }

        if (!CHECKOUT_COMPLETED.equals(type) && !ASYNC_PAYMENT_SUCCEEDED.equals(type)) {
            return ResponseEntity.ok().build();
        }

        // checkout.session.completed does NOT mean the money settled — see ASYNC_PAYMENT_SUCCEEDED's
        // javadoc above. Require "paid" before doing anything real; anything else is a no-op (Stripe
        // must not retry) and leaves the payment PENDING until the genuine settlement event arrives.
        String paymentStatus = root.path("data").path("object").path("payment_status").asText(null);
        if (!PAID.equals(paymentStatus)) {
            return ResponseEntity.ok().build();
        }

        ReceiptData receipt = TenantContext.runAsBox(boxId, () -> tx.execute(status -> {
            Payment p = payments.findByStripeSessionId(sessionId).orElse(null);
            if (p == null || "SUCCEEDED".equals(p.getStatus())) {
                return null; // replay of an already-handled event — idempotent no-op, no duplicate receipt
            }

            Subscription sub = subscriptions.findById(p.getSubscriptionId()).orElseThrow();
            // The payment points at a PLACEHOLDER subscription (whatever row existed when checkout
            // started — possibly a lapsed one on a DIFFERENT plan). Its membershipId is correct
            // (same member), but its planId is NOT the plan that was actually purchased. The bought
            // plan is in the session metadata, and the signature has been verified above, so it's
            // trustworthy. Use it — otherwise a lapsed member renewing onto a different plan pays
            // the new price but gets activated on the old plan (wrong duration/entitlement).
            // StripeCheckoutService always sets metadata.planId; fall back to the placeholder's plan
            // if it is ever absent or unparseable, rather than 500 on a (signed) malformed value.
            UUID planId = parsePlanId(root.path("data").path("object").path("metadata").path("planId").asText(null))
                    .orElse(sub.getPlanId());
            // recordPeriod re-resolves the membership's ACTIVE subscription independently and may
            // create a DIFFERENT row than the payment currently points at. Repoint the payment at
            // the row the money actually paid for, so receipts (T6) render the right subscription.
            Subscription paid = subscriptionService.recordPeriod(sub.getMembershipId(), planId,
                    p.getAmountCents(), "Stripe checkout");

            p.setSubscriptionId(paid.getId());
            p.setStatus("SUCCEEDED");
            // THIS is the settlement moment, and it is why settled_at exists: created_at was stamped
            // when checkout began, which for a delayed rail can be days earlier and in another month.
            p.setSettledAt(java.time.Instant.now());
            // Store the PaymentIntent so a later charge.refunded can be routed back to this row.
            if (intentId != null) p.setStripePaymentIntentId(intentId);
            payments.save(p);

            Plan plan = plans.findById(planId).orElse(null);
            return new ReceiptData(p, paid, plan);
        }));

        // House rule: mail fires strictly after commit, never from inside the transaction above.
        // null means either an early no-op path (unreached here — those return before runAsBox) or
        // the idempotent replay branch, which must never send a second receipt.
        if (receipt != null) {
            receipts.sendReceipt(receipt.payment(), receipt.subscription(), receipt.plan());
        }

        return ResponseEntity.ok().build();
    }

    private static java.util.Optional<UUID> parsePlanId(String raw) {
        if (raw == null || raw.isBlank()) return java.util.Optional.empty();
        try {
            return java.util.Optional.of(UUID.fromString(raw));
        } catch (IllegalArgumentException e) {
            return java.util.Optional.empty();
        }
    }
}
