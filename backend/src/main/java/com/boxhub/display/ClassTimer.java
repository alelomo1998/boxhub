package com.boxhub.display;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "class_timers")
public class ClassTimer {
    @Id @GeneratedValue private UUID id;
    @TenantId @Column(name = "box_id", nullable = false) private UUID boxId;
    @Column(name = "session_id", nullable = false) private UUID sessionId;
    @Column(name = "session_item_id") private UUID sessionItemId;
    @Column(name = "spec_json", nullable = false, columnDefinition = "jsonb") private String specJson;
    @Column(nullable = false) private String status = "PENDING";
    @Column(name = "started_at_epoch") private Long startedAtEpoch;
    @Column(name = "paused_elapsed_ms", nullable = false) private long pausedElapsedMs = 0;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID v) { this.sessionId = v; }
    public UUID getSessionItemId() { return sessionItemId; }
    public void setSessionItemId(UUID v) { this.sessionItemId = v; }
    public String getSpecJson() { return specJson; }
    public void setSpecJson(String v) { this.specJson = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Long getStartedAtEpoch() { return startedAtEpoch; }
    public void setStartedAtEpoch(Long v) { this.startedAtEpoch = v; }
    public long getPausedElapsedMs() { return pausedElapsedMs; }
    public void setPausedElapsedMs(long v) { this.pausedElapsedMs = v; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
