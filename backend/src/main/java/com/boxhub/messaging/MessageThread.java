package com.boxhub.messaging;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * One thread per member per box, shared by all staff (D-1). The staff side is "the box", not a
 * person: replies are attributed per message via Message.senderMembershipId.
 *
 * lastMessageAt / lastMessageFromStaff are DENORMALISED so the shared inbox list is one query with
 * no N+1. They are written only by MessagingService, in the same transaction as the message insert,
 * so they cannot drift. Do not set them anywhere else.
 */
@Entity
@Table(name = "message_thread")
public class MessageThread {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "last_message_at") private Instant lastMessageAt;
    @Column(name = "last_message_from_staff", nullable = false) private boolean lastMessageFromStaff;
    @Column(name = "member_last_read_at") private Instant memberLastReadAt;
    /** ONE marker for the whole staff (D-3). Coach A reading clears the thread for the team. */
    @Column(name = "staff_last_read_at") private Instant staffLastReadAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID membershipId) { this.membershipId = membershipId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastMessageAt() { return lastMessageAt; }
    public void setLastMessageAt(Instant lastMessageAt) { this.lastMessageAt = lastMessageAt; }
    public boolean isLastMessageFromStaff() { return lastMessageFromStaff; }
    public void setLastMessageFromStaff(boolean v) { this.lastMessageFromStaff = v; }
    public Instant getMemberLastReadAt() { return memberLastReadAt; }
    public void setMemberLastReadAt(Instant v) { this.memberLastReadAt = v; }
    public Instant getStaffLastReadAt() { return staffLastReadAt; }
    public void setStaffLastReadAt(Instant v) { this.staffLastReadAt = v; }

    /** Derived, never stored (spec §3). No status column, nothing to leave in the wrong state. */
    public boolean needsReply() {
        return !lastMessageFromStaff && lastMessageAt != null
                && (staffLastReadAt == null || lastMessageAt.isAfter(staffLastReadAt));
    }
}
