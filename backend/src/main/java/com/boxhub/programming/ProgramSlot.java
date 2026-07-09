package com.boxhub.programming;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "program_slot")
public class ProgramSlot {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "slot_date", nullable = false) private LocalDate slotDate;
    @Column(name = "track_id", nullable = false) private UUID trackId;
    @Column(name = "wod_id", nullable = false) private UUID wodId;
    @Column(nullable = false) private String status = "DRAFT";
    @Column(name = "published_at") private Instant publishedAt;
    @Column(name = "created_by") private UUID createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public LocalDate getSlotDate() { return slotDate; }
    public void setSlotDate(LocalDate slotDate) { this.slotDate = slotDate; }
    public UUID getTrackId() { return trackId; }
    public void setTrackId(UUID trackId) { this.trackId = trackId; }
    public UUID getWodId() { return wodId; }
    public void setWodId(UUID wodId) { this.wodId = wodId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
}
