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
    // V30 adds segment NOT NULL with no DB default, so every insert must carry it — including the
    // legacy PUT endpoint, which Task 5 retires but which must keep working until then.
    // EVERYONE is the honest value for a pre-M29a box-wide announcement.
    @Column(nullable = false) private String segment = "EVERYONE";
    /** class_sessions(id) when segment is CLASS_ROSTER, null otherwise — a DB check enforces it. */
    @Column(name = "segment_ref") private UUID segmentRef;
    @Column(name = "sent_by") private UUID sentBy;
    @Column(name = "sent_at", nullable = false) private Instant sentAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getSegment() { return segment; }
    public void setSegment(String segment) { this.segment = segment; }
    public UUID getSegmentRef() { return segmentRef; }
    public void setSegmentRef(UUID segmentRef) { this.segmentRef = segmentRef; }
    public UUID getSentBy() { return sentBy; }
    public void setSentBy(UUID sentBy) { this.sentBy = sentBy; }
    public Instant getSentAt() { return sentAt; }
    public void setSentAt(Instant sentAt) { this.sentAt = sentAt; }
}
