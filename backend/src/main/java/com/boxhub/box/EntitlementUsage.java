package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only consumption ledger. One row per ENTRY or CANCELLATION.
 * <p>
 * It exists because consumption cannot be counted from {@code bookings}: SlotRegenerationService
 * deletes the CANCELLED rows in a regenerated range, which would erase cancellation history and the
 * unrefunded entry of a late cancel. So {@code bookingId} carries NO foreign key and
 * {@code sessionStartAt} is copied rather than joined — either would let scheduling reach in here.
 * <p>
 * {@code @TenantId}: box-operational, the dominant read is one box counting its own members
 * (docs/TENANCY.md §8). Since M21 a tenant-less read of this table returns EMPTY rather than
 * erroring — every read in M16a runs on a request thread with a box tenant.
 */
@Entity
@Table(name = "entitlement_usage")
public class EntitlementUsage {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "subscription_id", nullable = false) private UUID subscriptionId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "booking_id") private UUID bookingId;
    @Column(name = "session_start_at", nullable = false) private Instant sessionStartAt;
    @Column(nullable = false) private String kind;
    @Column(nullable = false) private boolean refunded = false;
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(UUID v) { this.subscriptionId = v; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public UUID getBookingId() { return bookingId; }
    public void setBookingId(UUID v) { this.bookingId = v; }
    public Instant getSessionStartAt() { return sessionStartAt; }
    public void setSessionStartAt(Instant v) { this.sessionStartAt = v; }
    public String getKind() { return kind; }
    public void setKind(String v) { this.kind = v; }
    public boolean isRefunded() { return refunded; }
    public void setRefunded(boolean v) { this.refunded = v; }
    public Instant getCreatedAt() { return createdAt; }
}
