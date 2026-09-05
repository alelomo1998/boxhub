package com.boxhub.notify;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.TenantId;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** One notification, addressed to one membership. Written INSIDE the causing transaction (D-4). */
@Entity
@Table(name = "notification")
public class Notification {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private String type;

    /** Map, never a JSON String — Hibernate will not cast a String bind param to jsonb (see V10). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> params = new HashMap<>();

    @Column private String link;
    @Column(name = "source_id") private UUID sourceId;
    @Column(name = "dedupe_key") private String dedupeKey;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    /** Stays null forever for NEW_ANNOUNCEMENT: that type delegates to announcement_recipient (D-3). */
    @Column(name = "read_at") private Instant readAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID v) { this.membershipId = v; }
    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
    public Map<String, Object> getParams() { return params; }
    public void setParams(Map<String, Object> v) { this.params = v; }
    public String getLink() { return link; }
    public void setLink(String v) { this.link = v; }
    public UUID getSourceId() { return sourceId; }
    public void setSourceId(UUID v) { this.sourceId = v; }
    public String getDedupeKey() { return dedupeKey; }
    public void setDedupeKey(String v) { this.dedupeKey = v; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant v) { this.readAt = v; }
}
