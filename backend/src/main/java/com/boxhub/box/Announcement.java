package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** One active box-wide message (unique per box). */
@Entity
@Table(name = "announcement")
public class Announcement {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String body;
    // M29a/V30 renamed these columns to sent_by/sent_at. The mapping HAD to move with the
    // migration: ddl-auto is `validate`, so Hibernate checks every mapped entity against the schema
    // when the context boots — a renamed column with a stale mapping fails EVERY test, not just the
    // announcement ones. The Java accessor names deliberately still say "updated" so
    // AnnouncementController, HomeController and DevDataSeeder keep compiling; Task 5 renames the
    // accessors together with all three call sites, which is the only way to do it atomically.
    // V30 adds segment NOT NULL with no DB default, so every insert must carry it — including the
    // legacy PUT endpoint, which Task 5 retires but which must keep working until then.
    // EVERYONE is the honest value for a pre-M29a box-wide announcement.
    @Column(nullable = false) private String segment = "EVERYONE";
    /** class_sessions(id) when segment is CLASS_ROSTER, null otherwise — a DB check enforces it. */
    @Column(name = "segment_ref") private UUID segmentRef;
    @Column(name = "sent_by") private UUID updatedBy;
    @Column(name = "sent_at", nullable = false) private Instant updatedAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getSegment() { return segment; }
    public void setSegment(String segment) { this.segment = segment; }
    public UUID getSegmentRef() { return segmentRef; }
    public void setSegmentRef(UUID segmentRef) { this.segmentRef = segmentRef; }
    public UUID getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(UUID updatedBy) { this.updatedBy = updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
