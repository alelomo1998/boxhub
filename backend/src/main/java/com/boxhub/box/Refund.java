package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * Money given back. Append-only: a refund is an event, never an edit to the payment it reverses.
 * <p>
 * Before this existed, a refund could not be represented at all — {@code payment.status} admits only
 * SUCCEEDED / PENDING / FAILED (V17), and the Stripe webhook handled three event types, so a refund
 * issued from the Stripe dashboard changed <em>nothing</em> in this database and the payment row
 * stayed SUCCEEDED for ever. Every revenue number was therefore gross, permanently, with no way even
 * to estimate the gap.
 * <p>
 * A row rather than a flag on {@code payment}, because PARTIAL refunds exist and a payment can be
 * refunded more than once: a flag carries neither an amount nor a second occurrence.
 * <p>
 * {@code @TenantId}, exactly like {@link Payment}. The webhook writes it inside its existing
 * {@code runAsBox(boxId, () -> tx.execute(...))} nesting — that ordering is load-bearing, because
 * Hibernate resolves the tenant once when the session opens (docs/TENANCY.md §3).
 * <p>
 * <b>Not enforced here:</b> that the sum of a payment's refunds never exceeds the payment. A CHECK
 * cannot express an aggregate over sibling rows and a trigger should not; the service enforces it
 * and the test suite pins it.
 */
@Entity
@Table(name = "refund")
public class Refund {

    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "payment_id", nullable = false) private UUID paymentId;
    @Column(name = "amount_cents", nullable = false) private int amountCents;
    @Column(nullable = false) private String currency;
    @Column private String reason;
    /**
     * Stripe's own refund id ({@code re_...}). UNIQUE in the schema, which is what makes a replayed
     * webhook a no-op — the same idempotency shape {@code payment.stripe_session_id} already uses.
     * NULL for a refund recorded by hand.
     */
    @Column(name = "stripe_refund_id") private String stripeRefundId;
    /** NULL = the system, i.e. a Stripe-initiated refund arriving by webhook. */
    @Column(name = "recorded_by") private UUID recordedBy;
    /** When the money went back — what a revenue window filters on. */
    @Column(name = "refunded_at", nullable = false) private Instant refundedAt = Instant.now();
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    protected Refund() {}

    public Refund(UUID paymentId, int amountCents, String currency, String reason,
                  String stripeRefundId, UUID recordedBy, Instant refundedAt) {
        this.paymentId = paymentId;
        this.amountCents = amountCents;
        this.currency = currency;
        this.reason = reason;
        this.stripeRefundId = stripeRefundId;
        this.recordedBy = recordedBy;
        if (refundedAt != null) this.refundedAt = refundedAt;
    }

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getPaymentId() { return paymentId; }
    public int getAmountCents() { return amountCents; }
    public String getCurrency() { return currency; }
    public String getReason() { return reason; }
    public String getStripeRefundId() { return stripeRefundId; }
    public UUID getRecordedBy() { return recordedBy; }
    public Instant getRefundedAt() { return refundedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
