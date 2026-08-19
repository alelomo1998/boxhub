package com.boxhub.programming;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.UUID;

/** Hybrid WOD content: typed top-level fields live on the Wod row; movement lines live here as JSONB. */
public final class WodJson {
    private WodJson() {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(String text, UUID movementId, String reps, String load, String scaling) {}

    /**
     * A block holds lines, sub-blocks, or both. Nesting is capped at TWO levels — a block that is
     * itself nested must not carry `blocks`. The cap is enforced by WodJsonValidator, not by the type,
     * so that every blocks_json value written before M14a stays valid unchanged.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Block(String label, String note, List<Line> lines, List<Block> blocks) {}

    public record Blocks(List<Block> blocks) {
        public static Blocks empty() { return new Blocks(List.of()); }
    }

    /** WHEN a piece runs. Independent of Block, which is WHAT it prescribes (spec decision 7). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Segment(int seconds, String kind, String label) {}

    public record Timing(int rounds, List<Segment> segments) {
        public static Timing empty() { return new Timing(1, List.of()); }
    }
}
