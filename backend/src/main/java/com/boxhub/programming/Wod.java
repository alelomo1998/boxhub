package com.boxhub.programming;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.TenantId;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "wod")
public class Wod {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String title;
    @Column(name = "wod_type", nullable = false) private String wodType;
    @Column(name = "score_type", nullable = false) private String scoreType;
    @Column(name = "time_cap_seconds") private Integer timeCapSeconds;
    @Column(name = "body_text", nullable = false) private String bodyText = "";
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "blocks_json", columnDefinition = "jsonb", nullable = false)
    private String blocksJson = "{\"blocks\":[]}";
    @Column(name = "scaling_notes") private String scalingNotes;
    @Column(name = "benchmark_template_id") private UUID benchmarkTemplateId;
    @Column(name = "created_by") private UUID createdBy;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getWodType() { return wodType; }
    public void setWodType(String wodType) { this.wodType = wodType; }
    public String getScoreType() { return scoreType; }
    public void setScoreType(String scoreType) { this.scoreType = scoreType; }
    public Integer getTimeCapSeconds() { return timeCapSeconds; }
    public void setTimeCapSeconds(Integer timeCapSeconds) { this.timeCapSeconds = timeCapSeconds; }
    public String getBodyText() { return bodyText; }
    public void setBodyText(String bodyText) { this.bodyText = bodyText; }
    public String getBlocksJson() { return blocksJson; }
    public void setBlocksJson(String blocksJson) { this.blocksJson = blocksJson; }
    public String getScalingNotes() { return scalingNotes; }
    public void setScalingNotes(String scalingNotes) { this.scalingNotes = scalingNotes; }
    public UUID getBenchmarkTemplateId() { return benchmarkTemplateId; }
    public void setBenchmarkTemplateId(UUID benchmarkTemplateId) { this.benchmarkTemplateId = benchmarkTemplateId; }
    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
