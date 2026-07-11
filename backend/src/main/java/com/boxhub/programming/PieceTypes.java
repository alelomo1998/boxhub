package com.boxhub.programming;

import java.util.Set;

/** Piece-type vocabulary + default score type per type (coach can override per item). */
public final class PieceTypes {
    private PieceTypes() {}

    public static final Set<String> ALL = Set.of(
            "FOR_TIME", "AMRAP", "EMOM", "INTERVAL", "STRENGTH", "CUSTOM", "WARMUP", "CIRCUIT", "SKILL");

    public static String defaultScoreType(String wodType) {
        return switch (wodType) {
            case "FOR_TIME" -> "TIME";
            case "AMRAP", "INTERVAL" -> "ROUNDS_REPS";
            case "STRENGTH" -> "LOAD";
            default -> "NONE"; // EMOM, WARMUP, CIRCUIT, SKILL, CUSTOM: completion unless overridden
        };
    }
}
