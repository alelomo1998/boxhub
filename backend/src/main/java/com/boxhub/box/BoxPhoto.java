package com.boxhub.box;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * NOT @TenantId, deliberately. The public directory reads photos for many boxes at once and for
 * boxes the reader does not belong to; a @TenantId read cannot serve that under M21. box_id is
 * carried as a plain column and every query states its own predicate — docs/TENANCY.md §4.
 */
@Entity
@Table(name = "box_photo")
public class BoxPhoto {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id", nullable = false) private UUID boxId;
    @Column(nullable = false) private String path;
    @Column(name = "sort_order", nullable = false) private int sortOrder;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public Instant getCreatedAt() { return createdAt; }
}
