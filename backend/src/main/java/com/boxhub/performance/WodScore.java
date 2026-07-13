package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wod_score")
public class WodScore {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "session_item_id", nullable = false) private UUID sessionItemId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private boolean rx = true;
    @Column(name = "time_seconds") private Integer timeSeconds;
    @Column private Integer rounds;
    @Column private Integer reps;
    @Column private BigDecimal load;
    @Column(nullable = false) private boolean finished = true;
    @Column private String notes;
    @Column(name = "private", nullable = false) private boolean isPrivate = false;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();
    @Column(name = "logged_by") private UUID loggedBy;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSessionItemId() { return sessionItemId; }
    public void setSessionItemId(UUID sessionItemId) { this.sessionItemId = sessionItemId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID membershipId) { this.membershipId = membershipId; }
    public boolean isRx() { return rx; }
    public void setRx(boolean rx) { this.rx = rx; }
    public Integer getTimeSeconds() { return timeSeconds; }
    public void setTimeSeconds(Integer timeSeconds) { this.timeSeconds = timeSeconds; }
    public Integer getRounds() { return rounds; }
    public void setRounds(Integer rounds) { this.rounds = rounds; }
    public Integer getReps() { return reps; }
    public void setReps(Integer reps) { this.reps = reps; }
    public BigDecimal getLoad() { return load; }
    public void setLoad(BigDecimal load) { this.load = load; }
    public boolean isFinished() { return finished; }
    public void setFinished(boolean finished) { this.finished = finished; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public boolean isPrivate() { return isPrivate; }
    public void setPrivate(boolean isPrivate) { this.isPrivate = isPrivate; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public UUID getLoggedBy() { return loggedBy; }
    public void setLoggedBy(UUID loggedBy) { this.loggedBy = loggedBy; }
}
