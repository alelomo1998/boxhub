package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscription")
public class Subscription {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "plan_id", nullable = false) private UUID planId;
    @Column(nullable = false) private String status;
    /**
     * Why this subscription exists, as opposed to what state it is in. PAID | COMPED | TRIAL.
     * <p>
     * Replaces asking "is this subscription's plan named 'Comped'?" — a string comparison against a
     * per-box synthetic plan, which meant renaming or recreating that plan silently un-comped every
     * member on it. It also made a comp indistinguishable in the data from a member who simply has
     * not been charged yet, which matters to revenue: one is intentional and the other is debt.
     * <p>
     * Defaulted here in Java, not only in the schema, because ~60 tests construct this entity
     * directly — the same reason {@code Membership.status} carries a field initializer.
     * <p>
     * TRIAL is unused today and present on purpose, so M32a's trial -> member conversion board does
     * not invent a second marker for the same idea.
     */
    @Column(nullable = false) private String kind = "PAID";
    @Column(name = "price_cents", nullable = false) private int priceCents;
    @Column(name = "price_note") private String priceNote;
    @Column(name = "current_period_start", nullable = false) private Instant currentPeriodStart = Instant.now();
    @Column(name = "current_period_end") private Instant currentPeriodEnd;
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID membershipId) { this.membershipId = membershipId; }
    public UUID getPlanId() { return planId; }
    public void setPlanId(UUID planId) { this.planId = planId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getPriceCents() { return priceCents; }
    public void setPriceCents(int priceCents) { this.priceCents = priceCents; }
    public String getPriceNote() { return priceNote; }
    public void setPriceNote(String priceNote) { this.priceNote = priceNote; }
    public Instant getCurrentPeriodStart() { return currentPeriodStart; }
    public void setCurrentPeriodStart(Instant currentPeriodStart) { this.currentPeriodStart = currentPeriodStart; }
    public Instant getCurrentPeriodEnd() { return currentPeriodEnd; }
    public void setCurrentPeriodEnd(Instant currentPeriodEnd) { this.currentPeriodEnd = currentPeriodEnd; }
    public Instant getCreatedAt() { return createdAt; }
}
