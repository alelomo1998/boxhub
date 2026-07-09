package com.boxhub.programming;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.UUID;

/** Hybrid WOD content: typed top-level fields live on the Wod row; movement lines live here as JSONB. */
public final class WodJson {
    private WodJson() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(String text, UUID movementId, String reps, String load, String scaling) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Block(String label, String note, List<Line> lines) {}

    public record Blocks(List<Block> blocks) {
        public static Blocks empty() { return new Blocks(List.of()); }
    }
}
