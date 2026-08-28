package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** One row per member the announcement was sent to. The audience, frozen at send (D-2). */
@Entity
@Table(name = "announcement_recipient")
public class AnnouncementRecipient {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "announcement_id", nullable = false) private UUID announcementId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "read_at") private Instant readAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getAnnouncementId() { return announcementId; }
    public void setAnnouncementId(UUID v) { this.announcementId = v; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant readAt) { this.readAt = readAt; }
}
