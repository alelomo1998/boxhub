package com.boxhub.performance;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Pure ranking of a slot's scores: private omitted, RX block before scaled, ordered per score type. */
public final class Leaderboard {
    private Leaderboard() {}

    public static List<WodScore> rank(List<WodScore> scores, String scoreType) {
        List<WodScore> visible = scores.stream().filter(s -> !s.isPrivate()).toList();
        List<WodScore> rx = new ArrayList<>(visible.stream().filter(WodScore::isRx).toList());
        List<WodScore> scaled = new ArrayList<>(visible.stream().filter(s -> !s.isRx()).toList());
        Comparator<WodScore> cmp = comparator(scoreType);
        if (cmp != null) { rx.sort(cmp); scaled.sort(cmp); }
        List<WodScore> out = new ArrayList<>(rx.size() + scaled.size());
        out.addAll(rx);
        out.addAll(scaled);
        return out;
    }

    private static Comparator<WodScore> comparator(String scoreType) {
        return switch (scoreType) {
            case "TIME" ->
                // finished (asc time) rank above unfinished (desc reps completed)
                Comparator.comparing(WodScore::isFinished, Comparator.reverseOrder())
                        .thenComparing(s -> s.isFinished() ? nz(s.getTimeSeconds()) : Integer.MAX_VALUE)
                        .thenComparing(s -> s.isFinished() ? 0 : -nz(s.getReps()));
            case "ROUNDS_REPS" ->
                Comparator.<WodScore>comparingInt(s -> -nz(s.getRounds()))
                        .thenComparingInt(s -> -nz(s.getReps()));
            case "LOAD" ->
                Comparator.comparing((WodScore s) -> s.getLoad() == null ? BigDecimal.valueOf(-1) : s.getLoad())
                        .reversed();
            default -> null; // NONE: keep insertion order
        };
    }

    private static int nz(Integer v) { return v == null ? 0 : v; }
}
