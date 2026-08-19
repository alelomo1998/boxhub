package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId: holds both PUBLIC and BOX rows, so the discriminator stays on. M22 spec §3. */
@Entity
@Table(name = "post")
public class Post {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "author_membership_id", nullable = false) private UUID authorMembershipId;
    @Column(name = "wod_id") private UUID wodId;
    @Column private String caption;
    @Column(nullable = false) private String visibility;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getAuthorMembershipId() { return authorMembershipId; }
    public void setAuthorMembershipId(UUID authorMembershipId) { this.authorMembershipId = authorMembershipId; }
    public UUID getWodId() { return wodId; }
    public void setWodId(UUID wodId) { this.wodId = wodId; }
    public String getCaption() { return caption; }
    public void setCaption(String caption) { this.caption = caption; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public Instant getCreatedAt() { return createdAt; }
}
