package com.boxhub.programming;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.util.UUID;

/** Skeleton placeholder on a class type: label + piece type only. Pre-seeds the builder. */
@Entity
@Table(name = "template_piece")
public class TemplatePiece {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "class_type_id", nullable = false) private UUID classTypeId;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(nullable = false) private String label;
    @Column(name = "wod_type", nullable = false) private String wodType;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getClassTypeId() { return classTypeId; }
    public void setClassTypeId(UUID classTypeId) { this.classTypeId = classTypeId; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getWodType() { return wodType; }
    public void setWodType(String wodType) { this.wodType = wodType; }
}
