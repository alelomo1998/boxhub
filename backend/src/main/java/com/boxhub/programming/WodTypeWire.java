package com.boxhub.programming;

/**
 * Bridges the legacy {@code wodType} wire vocabulary (still sent/returned on every WOD and
 * skeleton-piece request/response — nine frontend files consume it, M14a may not touch them) to the
 * split {@code macro}/{@code timingPreset} columns that actually store it from M14a on.
 * <p>
 * Every direction of this mapping lives here, once — {@code CIRCUIT}/{@code CUSTOM} both compose
 * back as {@code WORKOUT} and {@code SKILL} as {@code GYMNASTIC}; that lossy round-trip is a
 * deliberate orchestrator ruling, not a bug.
 */
public final class WodTypeWire {
    private WodTypeWire() {}

    public static String toMacro(String wodType) {
        return switch (wodType) {
            case "WARMUP" -> "WARMUP";
            case "STRENGTH" -> "STRENGTH";
            case "SKILL" -> "GYMNASTIC";
            default -> "WORKOUT"; // CIRCUIT, CUSTOM, FOR_TIME, AMRAP, EMOM, INTERVAL
        };
    }

    public static String toTimingPreset(String wodType) {
        return switch (wodType) {
            case "FOR_TIME", "AMRAP", "EMOM", "INTERVAL" -> wodType;
            default -> null;
        };
    }

    public static String toWodType(String macro, String timingPreset) {
        return timingPreset != null ? timingPreset : macro;
    }
}
