package com.boxhub.performance;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "lift_entry")
public class LiftEntry {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(name = "movement_id", nullable = false) private UUID movementId;
    @Column(nullable = false) private BigDecimal load;
    @Column(nullable = false) private int reps = 1;
    @Column(name = "performed_on", nullable = false) private LocalDate performedOn;
    @Column private String notes;
    @Column(name = "is_pr", nullable = false) private boolean pr = false;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID membershipId) { this.membershipId = membershipId; }
    public UUID getMovementId() { return movementId; }
    public void setMovementId(UUID movementId) { this.movementId = movementId; }
    public BigDecimal getLoad() { return load; }
    public void setLoad(BigDecimal load) { this.load = load; }
    public int getReps() { return reps; }
    public void setReps(int reps) { this.reps = reps; }
    public LocalDate getPerformedOn() { return performedOn; }
    public void setPerformedOn(LocalDate performedOn) { this.performedOn = performedOn; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public boolean isPr() { return pr; }
    public void setPr(boolean pr) { this.pr = pr; }
    public Instant getCreatedAt() { return createdAt; }
}
