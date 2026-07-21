package com.boxhub.box;

import com.boxhub.shared.CryptoService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
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
 * {@code runAsBox(boxId, ...)}, mirroring {@code TvStreamService.runAsBox} exactly: a synthetic
 * box-scoped Authentication is installed BEFORE the transaction opens — {@code SessionGenerator}'s
 * documented trap is that @TenantId resolves to the NO_TENANT sentinel (and inserts then throw an
 * FK violation on {@code box_id}) if the tenant is set only after the Hibernate session/tx has
 * already started, so the {@code runAsBox(boxId, () -> tx.executeWithoutResult(...))} nesting
 * order below is load-bearing, not stylistic.
 */
@RestController
public class StripeWebhookController {

    private static final String CHECKOUT_COMPLETED = "checkout.session.completed";
    // A delayed-notification payment method (SEPA direct debit, bank transfer — one dashboard
    // toggle on a EUR account, and Plan.currency defaults to "eur") completes the SESSION
    // immediately but leaves payment_status "unpaid"; Stripe settles days later via this event,
    // or fails via async_payment_failed (not handled here — falls through to the type no-op below,
    // same as any other irrelevant event, leaving the payment PENDING forever, which is correct:
    // nothing was ever granted). Both accepted types are gated on payment_status "paid" below so
    // a member is only ever granted a subscription/receipt once the money actually settled.
    private static final String ASYNC_PAYMENT_SUCCEEDED = "checkout.session.async_payment_succeeded";
    private static final String PAID = "paid";

    private final PaymentRepository payments;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final BoxStripeRepository boxStripe;
    private final SubscriptionService subscriptionService;
    private final PaymentReceipts receipts;
    private final CryptoService crypto;
    private final TransactionTemplate tx;
    private final ObjectMapper json = new ObjectMapper();

    public StripeWebhookController(PaymentRepository payments, SubscriptionRepository subscriptions,
                                    PlanRepository plans, BoxStripeRepository boxStripe,
                                    SubscriptionService subscriptionService, PaymentReceipts receipts,
                                    CryptoService crypto, PlatformTransactionManager txManager) {
        this.payments = payments;
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
        if (sessionId == null) {
            return ResponseEntity.ok().build(); // nothing we can route — no-op, don't leak
        }

        Payment payment = payments.findByStripeSessionId(sessionId).orElse(null);
        if (payment == null) {
            return ResponseEntity.ok().build(); // unknown session id — no-op, don't leak
        }
        UUID boxId = payment.getBoxId();

        BoxStripe creds = boxStripe.findByBoxId(boxId).orElse(null);
        if (creds == null || !creds.isEnabled()) {
            return ResponseEntity.badRequest().build(); // no secret to verify against
        }
        String secret = crypto.decrypt(creds.getWebhookSecretEnc());

        try {
            Webhook.constructEvent(payload, sigHeader, secret);
        } catch (SignatureVerificationException e) {
            return ResponseEntity.badRequest().build(); // forged/mismatched — nothing written
        }

        String type = root.path("type").asText(null);
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

        ReceiptData receipt = runAsBox(boxId, () -> tx.execute(status -> {
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

    /** Mirrors TvStreamService.runAsBox — installs a synthetic box-scoped Authentication so
     *  @TenantId reads/writes resolve to boxId instead of the NO_TENANT sentinel. */
    private <T> T runAsBox(UUID boxId, java.util.function.Supplier<T> s) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("stripe-webhook").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
            return s.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }
}
