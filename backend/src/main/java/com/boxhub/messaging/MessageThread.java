package com.boxhub.messaging;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * A1.3: a thread is an unordered PAIR of memberships, stored in canonical order (lo < hi) so the
 * database's unique constraint genuinely means "one thread per pair" — see V31's check constraint.
 *
 * lastMessageAt / lastSenderMembershipId are DENORMALISED so the conversation list is one query
 * with no N+1. They are written only by MessagingService, in the same transaction as the message
 * insert, so they cannot drift. Do not set them anywhere else.
 */
@Entity
@Table(name = "message_thread")
public class MessageThread {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "member_lo_id", nullable = false) private UUID memberLoId;
    @Column(name = "member_hi_id", nullable = false) private UUID memberHiId;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "last_message_at") private Instant lastMessageAt;
    @Column(name = "last_sender_membership_id") private UUID lastSenderMembershipId;
    @Column(name = "lo_last_read_at") private Instant loLastReadAt;
    @Column(name = "hi_last_read_at") private Instant hiLastReadAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMemberLoId() { return memberLoId; }
    public void setMemberLoId(UUID memberLoId) { this.memberLoId = memberLoId; }
    public UUID getMemberHiId() { return memberHiId; }
    public void setMemberHiId(UUID memberHiId) { this.memberHiId = memberHiId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastMessageAt() { return lastMessageAt; }
    public void setLastMessageAt(Instant lastMessageAt) { this.lastMessageAt = lastMessageAt; }
    public UUID getLastSenderMembershipId() { return lastSenderMembershipId; }
    public void setLastSenderMembershipId(UUID v) { this.lastSenderMembershipId = v; }
    public Instant getLoLastReadAt() { return loLastReadAt; }
    public void setLoLastReadAt(Instant v) { this.loLastReadAt = v; }
    public Instant getHiLastReadAt() { return hiLastReadAt; }
    public void setHiLastReadAt(Instant v) { this.hiLastReadAt = v; }

    public boolean isLo(UUID me) { return me.equals(memberLoId); }

    public UUID counterpart(UUID me) { return isLo(me) ? memberHiId : memberLoId; }

    public Instant lastReadFor(UUID me) { return isLo(me) ? loLastReadAt : hiLastReadAt; }

    /** A1.8: the read marker belonging to the OTHER participant — "has my counterpart read?". */
    public Instant lastReadForCounterpartOf(UUID me) { return lastReadFor(counterpart(me)); }

    public void setLastReadFor(UUID me, Instant t) {
        if (isLo(me)) loLastReadAt = t; else hiLastReadAt = t;
    }

    /** Derived, never stored (A1.3). Viewer-relative: "the last message here isn't mine". */
    public boolean needsReplyFor(UUID me) {
        return lastSenderMembershipId != null && !lastSenderMembershipId.equals(me);
    }
}
