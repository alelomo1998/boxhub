package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** A class the box offers: identity plus its skeleton. When it runs lives on ScheduleSlot. */
@Entity
@Table(name = "class_type")
public class ClassType {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String name;
    @Column(name = "image_path") private String imagePath;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getImagePath() { return imagePath; }
    public void setImagePath(String imagePath) { this.imagePath = imagePath; }
    public Instant getCreatedAt() { return createdAt; }
}
