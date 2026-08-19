package com.boxhub.programming;

import java.util.Set;

/**
 * The macro axis: what part of a class a piece is. FIXED PLATFORM-WIDE, deliberately not
 * box-configurable — M25 publishes workouts across boxes, and per-box macro lists would make the
 * feed's filters and any cross-box comparison meaningless.
 */
public final class Macros {
    private Macros() {}
    public static final Set<String> ALL = Set.of("WARMUP", "STRENGTH", "GYMNASTIC", "WORKOUT");
}
