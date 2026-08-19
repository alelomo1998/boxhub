package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId — the 1-5 dumbbell rating on a box's wod. M22 spec §8. */
@Entity
@Table(name = "wod_rating")
public class WodRating {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "wod_id", nullable = false) private UUID wodId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(nullable = false) private int rating;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getWodId() { return wodId; }
    public void setWodId(UUID wodId) { this.wodId = wodId; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public int getRating() { return rating; }
    public void setRating(int rating) { this.rating = rating; }
    public Instant getCreatedAt() { return createdAt; }
}
