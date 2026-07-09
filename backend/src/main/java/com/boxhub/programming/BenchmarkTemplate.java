package com.boxhub.programming;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

/** Global read-only benchmark templates (girls + heroes). Not tenant-scoped; cloned into a box Wod. */
@Entity
@Table(name = "benchmark_template")
public class BenchmarkTemplate {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false) private String name;
    @Column(nullable = false) private String kind;
    @Column(name = "score_type", nullable = false) private String scoreType;
    @Column(name = "time_cap_seconds") private Integer timeCapSeconds;
    @Column(name = "body_text", nullable = false) private String bodyText;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "blocks_json", columnDefinition = "jsonb", nullable = false)
    private String blocksJson = "{\"blocks\":[]}";

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getKind() { return kind; }
    public String getScoreType() { return scoreType; }
    public Integer getTimeCapSeconds() { return timeCapSeconds; }
    public String getBodyText() { return bodyText; }
    public String getBlocksJson() { return blocksJson; }
}
