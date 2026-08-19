package com.boxhub.programming;

import java.util.Set;

/**
 * The timing axis, as PRESETS over a segment sequence — never types. The preset name survives for
 * filtering, analytics and the board's eyebrow, and never constrains what can be built.
 */
public final class TimingPresets {
    private TimingPresets() {}
    public static final Set<String> ALL = Set.of("FOR_TIME", "AMRAP", "EMOM", "TABATA", "INTERVAL");
}
