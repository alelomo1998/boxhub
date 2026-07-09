package com.boxhub.programming;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Movement catalog. Deliberately NOT @TenantId: global rows (boxId null) must be visible to
 * every box, so reads use an explicit {@code box_id is null or box_id = :box} filter instead
 * of the Hibernate tenant discriminator (which would hide globals). See MovementRepository.
 */
@Entity
@Table(name = "movement")
public class Movement {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id") private UUID boxId;                 // null = global seed
    @Column(nullable = false) private String name;
    @Column(nullable = false) private String category;
    @Column private String modality;
    @Column(nullable = false) private boolean active = true;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getModality() { return modality; }
    public void setModality(String modality) { this.modality = modality; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
}
