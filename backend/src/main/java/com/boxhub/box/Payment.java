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
    @Column(name = "subscription_id", nullable = false) private UUID subscriptionId;
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
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(UUID subscriptionId) { this.subscriptionId = subscriptionId; }
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
