package com.boxhub.notify;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.util.UUID;

/** One member's override of one type on one channel. Absent means "the type's default" (D-8). */
@Entity
@Table(name = "notification_pref")
public class NotificationPref {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private String type;
    @Column(nullable = false) private String channel;
    @Column(nullable = false) private boolean enabled;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
    public String getChannel() { return channel; }
    public void setChannel(String v) { this.channel = v; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean v) { this.enabled = v; }
}
