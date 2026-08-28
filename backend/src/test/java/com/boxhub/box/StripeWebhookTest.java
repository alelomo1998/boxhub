package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.shared.CryptoService;
import com.boxhub.shared.Mailer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The security-critical test for M10 T5. Deliberately does NOT hit the real Stripe network:
 * {@code com.stripe.net.Webhook.constructEvent} is a pure local HMAC-SHA256 check, so a signed
 * event is built by hand here using Stripe's documented signing scheme
 * ({@code signed_payload = "{timestamp}.{payload}"}, HMAC-SHA256 with the endpoint secret, hex
 * digest, header {@code t=<ts>,v1=<hex>}) — the same scheme the real Stripe backend uses to sign
 * outbound webhooks, and the same one {@code Webhook.constructEvent} verifies against.
 * <p>
 * Every assertion reads persisted state (never just a status code) — a test that only checked the
 * HTTP status would still pass if the tenant-less lookup silently found nothing (gotcha #1).
 */
class StripeWebhookTest extends AbstractIntegrationTest {

    private static final String WEBHOOK_SECRET = "whsec_test_signing_secret_for_stripe_webhook_1234567890";

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired PlanRepository plans;
    @Autowired MembershipRepository memberships;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired RefundRepository refunds;
    @Autowired BoxStripeRepository boxStripe;
    @Autowired AuthService authService;
    @Autowired CryptoService crypto;
    @MockitoBean Mailer mailer;

    // authService.register() (newMembership/newFixture, below) sends a verification mail through
    // this same now-mocked bean — an unstubbed mailer.link(...) returns null, and AuthService's
    // Map.of("link", null, ...) NPEs before send() is even reached (same gotcha documented on
    // PasswordResetTest/VerificationTest). Stub it globally so every pre-existing test in this
    // class keeps working now that Mailer is a mock instead of the real bean.
    @BeforeEach
    void stubMailer() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    private record Fixture(UUID boxId, UUID membershipId, UUID planId, UUID subscriptionId,
                            UUID paymentId, String sessionId) {}

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Webhook " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("wh-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private UUID newPlan() {
        Plan p = new Plan();
        p.setName("Monthly " + System.nanoTime());
        p.setDurationDays(30);
        p.setPriceCents(5000);
        p.setCurrency("eur");
        return plans.save(p).getId();
    }

    /** A box connected to Stripe, a membership already on this plan (grandfathered, null end —
     *  mirrors "already a member, now paying online for the first time"), and a PENDING payment
     *  carrying the checkout session id — exactly what StripeCheckoutService.createSession leaves
     *  behind before the webhook ever fires. */
    private Fixture newFixture(String slug) {
        UUID boxId = newBox(slug);
        actAsBox(boxId);
        UUID membershipId = newMembership(boxId);
        UUID planId = newPlan();

        Subscription sub = new Subscription();
        sub.setMembershipId(membershipId);
        sub.setPlanId(planId);
        sub.setStatus("ACTIVE");
        sub.setPriceCents(0);
        sub.setCurrentPeriodEnd(null); // grandfathered — the webhook's recordPeriod call should set a concrete end
        UUID subscriptionId = subscriptions.save(sub).getId();

        String sessionId = "cs_test_" + System.nanoTime() + "_" + UUID.randomUUID();
        Payment payment = new Payment();
        payment.setSubscriptionId(subscriptionId);
        payment.setAmountCents(5000);
        payment.setCurrency("eur");
        payment.setMethod("STRIPE");
        payment.setStatus("PENDING");
        payment.setStripeSessionId(sessionId);
        UUID paymentId = payments.save(payment).getId();

        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc(crypto.encrypt("rk_test_dummy_restricted_key"));
        bs.setWebhookSecretEnc(crypto.encrypt(WEBHOOK_SECRET));
        bs.setEnabled(true);
        boxStripe.save(bs);

        return new Fixture(boxId, membershipId, planId, subscriptionId, paymentId, sessionId);
    }

    /** Defaults payment_status to "paid" — the settled case every pre-existing test in this class
     *  exercises. The unpaid/delayed-rail cases below build their own payload explicitly. */
    private String eventPayload(String sessionId, String type) {
        return eventPayload(sessionId, type, "paid");
    }

    private String eventPayload(String sessionId, String type, String paymentStatus) {
        return "{\"type\":\"" + type + "\",\"data\":{\"object\":{\"id\":\"" + sessionId + "\"," +
                "\"payment_status\":\"" + paymentStatus + "\"}}}";
    }

    /** Like eventPayload but with the session metadata Stripe echoes back — carries the purchased
     *  planId, which the webhook must use (not the placeholder subscription's plan). Always "paid"
     *  — the cross-plan-renewal tests are about which plan activates, not settlement gating. */
    private String eventPayload(String sessionId, String type, UUID planId) {
        return "{\"type\":\"" + type + "\",\"data\":{\"object\":{\"id\":\"" + sessionId + "\"," +
                "\"payment_status\":\"paid\",\"metadata\":{\"planId\":\"" + planId + "\"}}}}";
    }

    /** Stripe's documented webhook signing scheme — a pure local HMAC, no network involved. */
    private String signatureHeader(String payload, String secret) throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        String signedPayload = timestamp + "." + payload;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
        return "t=" + timestamp + ",v1=" + HexFormat.of().formatHex(hash);
    }

    /** A completed session that also carries the PaymentIntent, as a real one does. */
    private String completedWithIntent(String sessionId, String intentId) {
        return "{\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"" + sessionId + "\"," +
                "\"payment_status\":\"paid\",\"payment_intent\":\"" + intentId + "\"}}}";
    }

    /**
     * A charge.refunded event. Note what it does NOT contain: a checkout session id. Its data.object
     * is a Charge (ch_...), which is exactly why routing needs the PaymentIntent.
     */
    private String chargeRefunded(String intentId, String refundId, int amount, String status) {
        return "{\"type\":\"charge.refunded\",\"data\":{\"object\":{\"id\":\"ch_" + System.nanoTime() + "\"," +
                "\"payment_intent\":\"" + intentId + "\",\"refunds\":{\"data\":[{" +
                "\"id\":\"" + refundId + "\",\"status\":\"" + status + "\",\"amount\":" + amount + "," +
                "\"currency\":\"eur\",\"reason\":\"requested_by_customer\"}]}}}}";
    }

    /** Named `send`, NOT `post`: a private post(...) here would shadow the statically-imported
     *  MockMvcRequestBuilders.post every other test in this class uses. */
    private void send(String payload) throws Exception {
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(payload, WEBHOOK_SECRET)).content(payload))
                .andExpect(status().isOk());
    }

    /** Settles a fixture's payment and returns the PaymentIntent now stored against it. */
    private String settle(Fixture f) throws Exception {
        String intentId = "pi_test_" + System.nanoTime();
        send(completedWithIntent(f.sessionId(), intentId));
        return intentId;
    }

    @Test
    void settlementStampsSettledAtAndStoresThePaymentIntent() throws Exception {
        Fixture f = newFixture("settle-" + System.nanoTime());
        String intentId = settle(f);

        actAsBox(f.boxId());
        Payment p = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(p.getStatus()).isEqualTo("SUCCEEDED");
        // created_at is the checkout ATTEMPT; settled_at is when the money arrived. On a delayed
        // rail these fall in different months, which is the whole reason the column exists.
        assertThat(p.getSettledAt()).isNotNull();
        assertThat(p.getStripePaymentIntentId()).isEqualTo(intentId);
    }

    @Test
    void aPendingPaymentHasNoSettledAt() throws Exception {
        Fixture f = newFixture("unsettled-" + System.nanoTime());
        actAsBox(f.boxId());
        // Nothing has settled it: PENDING means "not settled", and settled_at says so.
        assertThat(payments.findByStripeSessionId(f.sessionId()).orElseThrow().getSettledAt()).isNull();
    }

    @Test
    void chargeRefundedIsRoutedByPaymentIntentAndRecorded() throws Exception {
        Fixture f = newFixture("refund-" + System.nanoTime());
        String intentId = settle(f);
        String refundId = "re_test_" + System.nanoTime();

        send(chargeRefunded(intentId, refundId, 1500, "succeeded"));

        actAsBox(f.boxId());
        var rows = refunds.findByPaymentId(f.paymentId());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAmountCents()).isEqualTo(1500);
        assertThat(rows.get(0).getStripeRefundId()).isEqualTo(refundId);
        assertThat(rows.get(0).getBoxId()).isEqualTo(f.boxId());
        // The payment is untouched: a refund is an event, never an edit to what was paid.
        assertThat(payments.findById(f.paymentId()).orElseThrow().getStatus()).isEqualTo("SUCCEEDED");
    }

    @Test
    void replayedChargeRefundedRecordsItOnlyOnce() throws Exception {
        Fixture f = newFixture("refund-replay-" + System.nanoTime());
        String intentId = settle(f);
        String refundId = "re_test_" + System.nanoTime();
        String payload = chargeRefunded(intentId, refundId, 1500, "succeeded");

        // A charge carries ALL its refunds, so every Stripe retry replays the whole list.
        send(payload);
        send(payload);

        actAsBox(f.boxId());
        assertThat(refunds.findByPaymentId(f.paymentId())).hasSize(1);
    }

    @Test
    void aRefundExceedingTheAmountPaidIsNotRecorded() throws Exception {
        Fixture f = newFixture("refund-over-" + System.nanoTime());
        String intentId = settle(f);

        // The fixture paid 5000. 6000 back means our record and Stripe's disagree; recording it
        // would put the ledger into a state no revenue sum could interpret.
        send(chargeRefunded(intentId, "re_over_" + System.nanoTime(), 6000, "succeeded"));

        actAsBox(f.boxId());
        assertThat(refunds.findByPaymentId(f.paymentId())).isEmpty();
    }

    @Test
    void aRefundThatHasNotSucceededYetIsNotRecorded() throws Exception {
        Fixture f = newFixture("refund-pending-" + System.nanoTime());
        String intentId = settle(f);

        // Not money back yet. Stripe sends another event when it becomes money back.
        send(chargeRefunded(intentId, "re_pending_" + System.nanoTime(), 1500, "pending"));

        actAsBox(f.boxId());
        assertThat(refunds.findByPaymentId(f.paymentId())).isEmpty();
    }

    @Test
    void chargeRefundedForAnUnknownPaymentIntentIs200AndWritesNothing() throws Exception {
        Fixture f = newFixture("refund-unknown-" + System.nanoTime());
        settle(f);

        // Same 200 as any other unroutable event — the endpoint must not become an existence
        // oracle over Stripe ids.
        send(chargeRefunded("pi_never_seen_" + System.nanoTime(), "re_x_" + System.nanoTime(), 100, "succeeded"));

        actAsBox(f.boxId());
        assertThat(refunds.findByPaymentId(f.paymentId())).isEmpty();
    }

    @Test
    void validSignatureAndCheckoutCompletedMarksPaymentSucceededAndActivatesSubscription() throws Exception {
        Fixture f = newFixture("valid-" + System.nanoTime());
        String payload = eventPayload(f.sessionId(), "checkout.session.completed");
        String sig = signatureHeader(payload, WEBHOOK_SECRET);

        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        // MockMvc's filter chain clears SecurityContextHolder at the end of the request
        // (SecurityContextHolderFilter) — re-establish tenant scope for direct @TenantId reads.
        actAsBox(f.boxId());

        Payment payment = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(payment.getStatus()).isEqualTo("SUCCEEDED");

        Subscription sub = subscriptions.findById(f.subscriptionId()).orElseThrow();
        assertThat(sub.getStatus()).isEqualTo("ACTIVE");
        assertThat(sub.getCurrentPeriodEnd()).isNotNull(); // grandfathered null end -> concrete period, now real
        assertThat(sub.getCurrentPeriodEnd()).isAfter(Instant.now().plusSeconds(29L * 24 * 3600));
    }

    @Test
    void replayedEventIsIdempotentNoSecondExtend() throws Exception {
        Fixture f = newFixture("replay-" + System.nanoTime());
        String payload = eventPayload(f.sessionId(), "checkout.session.completed");
        String sig = signatureHeader(payload, WEBHOOK_SECRET);

        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        actAsBox(f.boxId());
        Instant firstEnd = subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd();
        assertThat(firstEnd).isNotNull();

        // Same event, same signature — exactly what a Stripe retry looks like.
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        actAsBox(f.boxId());
        Instant secondEnd = subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd();
        assertThat(secondEnd).isEqualTo(firstEnd); // no second extend

        Payment payment = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(payment.getStatus()).isEqualTo("SUCCEEDED");
    }

    @Test
    void forgedSignatureIs400AndNothingChanges() throws Exception {
        Fixture f = newFixture("forged-" + System.nanoTime());
        String payload = eventPayload(f.sessionId(), "checkout.session.completed");
        String wrongSig = signatureHeader(payload, "whsec_a_completely_different_secret_1234567890");

        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", wrongSig).content(payload))
                .andExpect(status().isBadRequest());

        Payment payment = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(payment.getStatus()).isEqualTo("PENDING"); // unchanged

        actAsBox(f.boxId());
        Subscription sub = subscriptions.findById(f.subscriptionId()).orElseThrow();
        assertThat(sub.getCurrentPeriodEnd()).isNull(); // still grandfathered — never extended
    }

    @Test
    void webhookRepointsPaymentAtTheSubscriptionRecordPeriodActuallyPaidFor() throws Exception {
        // A lapsed member renews: the checkout placeholder points the payment at the member's old
        // EXPIRED subscription (that's all createSession had to satisfy the NOT-NULL FK), and there
        // is no ACTIVE subscription, so recordPeriod CREATES a fresh one. The payment must end up
        // pointing at that new row, not the stale EXPIRED one — otherwise T6 receipts render wrong.
        UUID boxId = newBox("repoint-" + System.nanoTime());
        actAsBox(boxId);
        UUID membershipId = newMembership(boxId);
        UUID planId = newPlan();

        Subscription expired = new Subscription();
        expired.setMembershipId(membershipId);
        expired.setPlanId(planId);
        expired.setStatus("EXPIRED");
        expired.setPriceCents(5000);
        expired.setCurrentPeriodEnd(Instant.now().minusSeconds(3600));
        UUID expiredSubId = subscriptions.save(expired).getId();

        String sessionId = "cs_test_" + System.nanoTime() + "_" + UUID.randomUUID();
        Payment payment = new Payment();
        payment.setSubscriptionId(expiredSubId); // the placeholder createSession would set
        payment.setAmountCents(5000);
        payment.setCurrency("eur");
        payment.setMethod("STRIPE");
        payment.setStatus("PENDING");
        payment.setStripeSessionId(sessionId);
        payments.save(payment);

        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc(crypto.encrypt("rk_test_dummy"));
        bs.setWebhookSecretEnc(crypto.encrypt(WEBHOOK_SECRET));
        bs.setEnabled(true);
        boxStripe.save(bs);

        String payload = eventPayload(sessionId, "checkout.session.completed");
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(payload, WEBHOOK_SECRET)).content(payload))
                .andExpect(status().isOk());

        actAsBox(boxId);
        Payment saved = payments.findByStripeSessionId(sessionId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(saved.getSubscriptionId()).isNotEqualTo(expiredSubId); // repointed off the stale row

        Subscription paid = subscriptions.findById(saved.getSubscriptionId()).orElseThrow();
        assertThat(paid.getStatus()).isEqualTo("ACTIVE");
        assertThat(paid.getCurrentPeriodEnd()).isAfter(Instant.now().plusSeconds(29L * 24 * 3600));

        // the old EXPIRED row is left as-is, not resurrected
        assertThat(subscriptions.findById(expiredSubId).orElseThrow().getStatus()).isEqualTo("EXPIRED");
    }

    @Test
    void lapsedMemberRenewingOntoADifferentPlanIsActivatedOnThePlanTheyPaidFor() throws Exception {
        // The member's stale placeholder subscription is on plan A (EXPIRED). They check out plan B.
        // The webhook must activate plan B (what they paid for), NOT plan A (the placeholder's plan).
        UUID boxId = newBox("crossplan-" + System.nanoTime());
        actAsBox(boxId);
        UUID membershipId = newMembership(boxId);

        Plan planA = new Plan();
        planA.setName("Basic " + System.nanoTime());
        planA.setDurationDays(30);
        planA.setPriceCents(3000);
        planA.setCurrency("eur");
        UUID planAId = plans.save(planA).getId();

        Plan planB = new Plan();
        planB.setName("Elite " + System.nanoTime());
        planB.setDurationDays(90);
        planB.setPriceCents(9000);
        planB.setCurrency("eur");
        UUID planBId = plans.save(planB).getId();

        Subscription expired = new Subscription();
        expired.setMembershipId(membershipId);
        expired.setPlanId(planAId);
        expired.setStatus("EXPIRED");
        expired.setPriceCents(3000);
        expired.setCurrentPeriodEnd(Instant.now().minusSeconds(3600));
        UUID expiredId = subscriptions.save(expired).getId();

        String sessionId = "cs_test_" + System.nanoTime() + "_" + UUID.randomUUID();
        Payment payment = new Payment();
        payment.setSubscriptionId(expiredId); // placeholder points at the plan-A row
        payment.setAmountCents(9000);         // but the money is plan B's price
        payment.setCurrency("eur");
        payment.setMethod("STRIPE");
        payment.setStatus("PENDING");
        payment.setStripeSessionId(sessionId);
        payments.save(payment);

        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxId);
        bs.setRestrictedKeyEnc(crypto.encrypt("rk_test_dummy"));
        bs.setWebhookSecretEnc(crypto.encrypt(WEBHOOK_SECRET));
        bs.setEnabled(true);
        boxStripe.save(bs);

        String payload = eventPayload(sessionId, "checkout.session.completed", planBId);
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(payload, WEBHOOK_SECRET)).content(payload))
                .andExpect(status().isOk());

        actAsBox(boxId);
        Payment saved = payments.findByStripeSessionId(sessionId).orElseThrow();
        Subscription paid = subscriptions.findById(saved.getSubscriptionId()).orElseThrow();
        assertThat(paid.getPlanId()).isEqualTo(planBId); // activated on the plan actually purchased
        assertThat(paid.getStatus()).isEqualTo("ACTIVE");
        // plan B is 90 days — a plan-A (30d) activation would land the end well short of 60 days out.
        assertThat(paid.getCurrentPeriodEnd()).isAfter(Instant.now().plusSeconds(60L * 24 * 3600));
    }

    @Test
    void unknownSessionIdIs200NoOpAndDoesNotTouchAnyPayment() throws Exception {
        Fixture f = newFixture("unknown-" + System.nanoTime()); // a real, unrelated PENDING payment
        String unknownSessionId = "cs_test_never_created_" + System.nanoTime();
        String payload = eventPayload(unknownSessionId, "checkout.session.completed");
        // No payment row means no box to resolve a secret from, so signature verification is never
        // reached — any well-formed header proves the point (garbage v1, real timestamp).
        String sig = "t=" + Instant.now().getEpochSecond() + ",v1=" + "0".repeat(64);

        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        Payment untouched = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(untouched.getStatus()).isEqualTo("PENDING");
    }

    /**
     * M11 T6 — closing an existence oracle. This endpoint is unauthenticated, so any status code
     * that varies with "does this session id exist" is an oracle an anonymous caller can probe.
     * M10 answered 200 for an unknown session id but 400 for a known one whose box had no
     * credentials; both are now 200, and neither writes anything.
     */
    @Test
    void unknownSessionAndMissingCredentialsAreIndistinguishableAndNeitherWrites() throws Exception {
        // A well-formed header is enough: neither path ever reaches signature verification.
        String sig = "t=" + Instant.now().getEpochSecond() + ",v1=" + "0".repeat(64);

        // (a) session id that was never created.
        String unknownPayload = eventPayload("cs_test_never_created_" + System.nanoTime(),
                "checkout.session.completed");
        int unknownStatus = mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(unknownPayload))
                .andReturn().getResponse().getStatus();

        // (b) real session id, but the box disconnected Stripe (row deleted).
        Fixture deleted = newFixture("nocreds-del-" + System.nanoTime());
        boxStripe.findByBoxId(deleted.boxId()).ifPresent(boxStripe::delete);
        String deletedPayload = eventPayload(deleted.sessionId(), "checkout.session.completed");
        int deletedStatus = mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(deletedPayload))
                .andReturn().getResponse().getStatus();

        // (c) real session id, credentials present but disabled — the other half of the guard.
        Fixture disabled = newFixture("nocreds-off-" + System.nanoTime());
        BoxStripe off = boxStripe.findByBoxId(disabled.boxId()).orElseThrow();
        off.setEnabled(false);
        boxStripe.save(off);
        String disabledPayload = eventPayload(disabled.sessionId(), "checkout.session.completed");
        int disabledStatus = mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(disabledPayload))
                .andReturn().getResponse().getStatus();

        assertThat(unknownStatus).isEqualTo(200);
        assertThat(deletedStatus).as("no-credentials must not be distinguishable from unknown-session")
                .isEqualTo(unknownStatus);
        assertThat(disabledStatus).isEqualTo(unknownStatus);

        // Nothing written on either credential-less path.
        for (Fixture f : java.util.List.of(deleted, disabled)) {
            assertThat(payments.findByStripeSessionId(f.sessionId()).orElseThrow().getStatus())
                    .isEqualTo("PENDING");
            actAsBox(f.boxId());
            assertThat(subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd())
                    .isNull();
        }
    }

    /**
     * The CRITICAL fix: a delayed-notification payment method (SEPA debit, bank transfer) fires
     * checkout.session.completed immediately with payment_status "unpaid" — money hasn't moved yet.
     * Granting the subscription/receipt here would let a bounced debit train for free. Only once
     * Stripe's real settlement event (checkout.session.async_payment_succeeded) lands should the
     * member actually get activated — and a replay of either event afterwards must never re-extend.
     */
    @Test
    void completedWithUnpaidStatusIsNoOpThenAsyncSucceededSettlesExactlyOnce() throws Exception {
        Fixture f = newFixture("delayed-" + System.nanoTime());
        // newFixture()'s authService.register() already sent ITS OWN unrelated verify-email mail —
        // every assertion below is scoped to the "payment-receipt" template specifically, not a
        // blanket zero-mail-ever assertion.

        // Step 1: the session completes but the money is not in yet.
        String unpaidPayload = eventPayload(f.sessionId(), "checkout.session.completed", "unpaid");
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(unpaidPayload, WEBHOOK_SECRET))
                        .content(unpaidPayload))
                .andExpect(status().isOk());

        Payment stillPending = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(stillPending.getStatus()).isEqualTo("PENDING");
        actAsBox(f.boxId());
        assertThat(subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd()).isNull();
        verify(mailer, never()).send(any(), any(), eq("payment-receipt"), any());

        // Step 2: the delayed rail genuinely settles.
        String succeededPayload = eventPayload(f.sessionId(), "checkout.session.async_payment_succeeded", "paid");
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(succeededPayload, WEBHOOK_SECRET))
                        .content(succeededPayload))
                .andExpect(status().isOk());

        Payment settled = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(settled.getStatus()).isEqualTo("SUCCEEDED");
        actAsBox(f.boxId());
        Instant firstEnd = subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd();
        assertThat(firstEnd).isNotNull();
        verify(mailer, times(1)).send(any(), any(), eq("payment-receipt"), any());

        // Step 3: a replay of the settlement event (Stripe retry) must not double-extend or re-mail.
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(succeededPayload, WEBHOOK_SECRET))
                        .content(succeededPayload))
                .andExpect(status().isOk());

        actAsBox(f.boxId());
        Instant secondEnd = subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd();
        assertThat(secondEnd).isEqualTo(firstEnd);
        verify(mailer, times(1)).send(any(), any(), eq("payment-receipt"), any()); // still exactly one — no duplicate

        // Step 4: a replay of the ORIGINAL unpaid-completed event also changes nothing further.
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(unpaidPayload, WEBHOOK_SECRET))
                        .content(unpaidPayload))
                .andExpect(status().isOk());
        actAsBox(f.boxId());
        assertThat(subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd()).isEqualTo(firstEnd);
    }

    /**
     * The other half of the delayed-rail story: the debit/transfer BOUNCES instead of settling.
     * Nothing was ever granted (payment_status never reached "paid"), so there is nothing to undo —
     * but the row must stop being PENDING forever, and the member must be told, or they sit believing
     * they're subscribed until a booking fails.
     */
    @Test
    void asyncPaymentFailedMarksThePaymentFailedAndTellsTheMember() throws Exception {
        Fixture f = newFixture("failed-" + System.nanoTime());
        String payload = eventPayload(f.sessionId(), "checkout.session.async_payment_failed", "unpaid");
        String sig = signatureHeader(payload, WEBHOOK_SECRET);

        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        Payment payment = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(payment.getStatus()).isEqualTo("FAILED");

        actAsBox(f.boxId());
        // no subscription was granted
        assertThat(subscriptions.findById(f.subscriptionId()).orElseThrow().getCurrentPeriodEnd()).isNull();

        verify(mailer, times(1)).send(any(), any(), eq("payment-failed"), any());
    }

    @Test
    void aReplayedAsyncPaymentFailedChangesNothingAndDoesNotMailTwice() throws Exception {
        Fixture f = newFixture("failed-replay-" + System.nanoTime());
        String payload = eventPayload(f.sessionId(), "checkout.session.async_payment_failed", "unpaid");
        String sig = signatureHeader(payload, WEBHOOK_SECRET);

        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        Payment firstPass = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(firstPass.getStatus()).isEqualTo("FAILED");
        verify(mailer, times(1)).send(any(), any(), eq("payment-failed"), any());

        // Same event, same signature — exactly what a Stripe retry looks like.
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", sig).content(payload))
                .andExpect(status().isOk());

        Payment secondPass = payments.findByStripeSessionId(f.sessionId()).orElseThrow();
        assertThat(secondPass.getStatus()).isEqualTo("FAILED"); // unchanged
        verify(mailer, times(1)).send(any(), any(), eq("payment-failed"), any()); // still exactly one — no duplicate
    }
}
