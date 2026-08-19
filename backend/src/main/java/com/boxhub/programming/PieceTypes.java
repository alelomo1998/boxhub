package com.boxhub.programming;

import java.util.Set;

/**
 * The legacy piece-type WIRE vocabulary — every WOD/skeleton-piece request and response still
 * sends/returns one of these under {@code wodType} (nine frontend files consume it; M14a may not
 * touch them). Kept until M14c rebuilds the builder against the split macro/timingPreset/score axes.
 * {@link WodTypeWire} bridges this vocabulary to the columns that actually store it now.
 */
public final class PieceTypes {
    private PieceTypes() {}

    public static final Set<String> ALL = Set.of(
            "FOR_TIME", "AMRAP", "EMOM", "INTERVAL", "STRENGTH", "CUSTOM", "WARMUP", "CIRCUIT", "SKILL");
}
