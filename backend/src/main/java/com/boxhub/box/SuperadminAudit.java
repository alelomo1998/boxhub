package com.boxhub.box;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only record of a superadmin lifecycle action (approve/reject/suspend/reactivate/settings
 * change) — who, what, on which box, when. Platform-wide by nature: deliberately NOT
 * {@code @TenantId}, the opposite of nearly every other entity in this package. There is no
 * update or delete path anywhere in the code; rows are write-once.
 */
@Entity
@Table(name = "superadmin_audit")
public class SuperadminAudit {
    @Id @GeneratedValue private UUID id;
    @Column(name = "actor_email", nullable = false) private String actorEmail;
    @Column(nullable = false) private String action;
    @Column(name = "box_id") private UUID boxId;
    private String detail;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    protected SuperadminAudit() {}

    public SuperadminAudit(String actorEmail, String action, UUID boxId, String detail) {
        this.actorEmail = actorEmail;
        this.action = action;
        this.boxId = boxId;
        this.detail = detail;
    }

    public UUID getId() { return id; }
    public String getActorEmail() { return actorEmail; }
    public String getAction() { return action; }
    public UUID getBoxId() { return boxId; }
    public String getDetail() { return detail; }
    public Instant getCreatedAt() { return createdAt; }
}
