package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "payment")
public class Payment {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    // Nullable since M22: a drop-in and a PT session are not subscriptions. ck_payment_subject
    // (V26) enforces that exactly one of the three product FKs below is set.
    @Column(name = "subscription_id") private UUID subscriptionId;
    @Column(name = "booking_id") private UUID bookingId;
    @Column(name = "pt_booking_id") private UUID ptBookingId;
    /** NULL means the BOX is paid; set means that coach is paid (spec D2). */
    @Column(name = "payee_membership_id") private UUID payeeMembershipId;
    @Column(name = "amount_cents", nullable = false) private int amountCents;
    @Column(nullable = false) private String currency;
    @Column(nullable = false) private String method;
    @Column(nullable = false) private String status;
    @Column(name = "stripe_session_id") private String stripeSessionId;
    @Column(name = "recorded_by") private UUID recordedBy;
    @Column private String reference;
    /** What the plan's list price was WHEN THIS PAYMENT WAS TAKEN. Null for rows created before
     *  M12b — the receipt omits the discount line rather than computing one against today's price. */
    @Column(name = "list_price_cents") private Integer listPriceCents;
    /**
     * When the money actually ARRIVED, as distinct from when checkout was attempted.
     * <p>
     * {@code createdAt} is {@code insertable=false, updatable=false} over a {@code default now()}
     * column, so the webhook cannot touch it when a PENDING row settles. For a card that is a
     * distinction without a difference; for the delayed-notification rails the webhook exists to
     * handle (SEPA debit, bank transfer) settlement can land days later and in a DIFFERENT MONTH.
     * A revenue figure keyed on {@code createdAt} books the money to the month the member clicked.
     * <p>
     * NULL means "not settled", which is exactly what a PENDING or FAILED row is. Revenue reads
     * this; {@code createdAt} stays what it always was, the attempt time.
     */
    @Column(name = "settled_at") private Instant settledAt;
    /**
     * The Stripe PaymentIntent behind this payment, captured when the checkout session completes.
     * <p>
     * It exists so a refund can be routed here at all: a {@code charge.refunded} event's
     * {@code data.object} is a CHARGE, whose id is {@code ch_...} and never matches a {@code cs_...}
     * session id — but the charge carries {@code payment_intent}, and the completed session carries
     * the same value. Stripe does NOT propagate a session's metadata onto the charge unless
     * {@code payment_intent_data.metadata} is set at session-creation time, and it is not.
     */
    @Column(name = "stripe_payment_intent_id") private String stripePaymentIntentId;
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false) private Instant createdAt;

    public Instant getSettledAt() { return settledAt; }
    public void setSettledAt(Instant settledAt) { this.settledAt = settledAt; }
    public String getStripePaymentIntentId() { return stripePaymentIntentId; }
    public void setStripePaymentIntentId(String v) { this.stripePaymentIntentId = v; }

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(UUID subscriptionId) { this.subscriptionId = subscriptionId; }
    public UUID getBookingId() { return bookingId; }
    public void setBookingId(UUID bookingId) { this.bookingId = bookingId; }
    public UUID getPtBookingId() { return ptBookingId; }
    public void setPtBookingId(UUID ptBookingId) { this.ptBookingId = ptBookingId; }
    public UUID getPayeeMembershipId() { return payeeMembershipId; }
    public void setPayeeMembershipId(UUID payeeMembershipId) { this.payeeMembershipId = payeeMembershipId; }
    public int getAmountCents() { return amountCents; }
    public void setAmountCents(int amountCents) { this.amountCents = amountCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getStripeSessionId() { return stripeSessionId; }
    public void setStripeSessionId(String stripeSessionId) { this.stripeSessionId = stripeSessionId; }
    public UUID getRecordedBy() { return recordedBy; }
    public void setRecordedBy(UUID recordedBy) { this.recordedBy = recordedBy; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public Integer getListPriceCents() { return listPriceCents; }
    public void setListPriceCents(Integer listPriceCents) { this.listPriceCents = listPriceCents; }
    public Instant getCreatedAt() { return createdAt; }
}
