package com.boxhub.programming;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** One ordered piece of a class instance's programming. */
@Entity
@Table(name = "session_item")
public class SessionItem {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "session_id", nullable = false) private UUID sessionId;
    @Column(name = "wod_id", nullable = false) private UUID wodId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private boolean scoreable = false;
    @Column(name = "score_type", nullable = false) private String scoreType;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getWodId() { return wodId; }
    public void setWodId(UUID wodId) { this.wodId = wodId; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isScoreable() { return scoreable; }
    public void setScoreable(boolean scoreable) { this.scoreable = scoreable; }
    public String getScoreType() { return scoreType; }
    public void setScoreType(String scoreType) { this.scoreType = scoreType; }
}
