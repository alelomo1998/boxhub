package com.boxhub.performance;

import com.boxhub.programming.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box")
public class HistoryController {

    private final WodScoreRepository scores;
    private final ProgramSlotRepository slots;
    private final WodRepository wods;
    private final TrackRepository tracks;
    private final BenchmarkTemplateRepository benchmarks;
    private final ScoreService scoreService;

    public HistoryController(WodScoreRepository scores, ProgramSlotRepository slots, WodRepository wods,
                             TrackRepository tracks, BenchmarkTemplateRepository benchmarks, ScoreService scoreService) {
        this.scores = scores;
        this.slots = slots;
        this.wods = wods;
        this.tracks = tracks;
        this.benchmarks = benchmarks;
        this.scoreService = scoreService;
    }

    public record MyScoreDto(UUID slotId, LocalDate slotDate, String wodTitle, String trackName, String scoreType,
                             boolean rx, Integer timeSeconds, Integer rounds, Integer reps, BigDecimal load,
                             boolean finished) {}
    public record BenchmarkHistoryDto(String benchmarkName, String scoreType, Integer timeSeconds, Integer rounds,
                                      Integer reps, BigDecimal load, LocalDate achievedOn) {}

    @GetMapping("/my-scores")
    @Transactional(readOnly = true)
    public List<MyScoreDto> myScores() {
        UUID mid = scoreService.callerMembershipId();
        Map<UUID, ProgramSlot> slotById = slots.findAll().stream()
                .collect(Collectors.toMap(ProgramSlot::getId, s -> s, (a, b) -> a));
        Map<UUID, Wod> wodById = wods.findAll().stream().collect(Collectors.toMap(Wod::getId, w -> w, (a, b) -> a));
        Map<UUID, String> trackNames = tracks.findAll().stream()
                .collect(Collectors.toMap(Track::getId, Track::getName, (a, b) -> a));

        List<MyScoreDto> out = new ArrayList<>();
        for (WodScore s : scores.findByMembershipIdOrderByCreatedAtDesc(mid)) {
            ProgramSlot slot = slotById.get(s.getSlotId());
            Wod w = slot == null ? null : wodById.get(slot.getWodId());
            out.add(new MyScoreDto(s.getSlotId(), slot == null ? null : slot.getSlotDate(),
                    w == null ? null : w.getTitle(),
                    slot == null ? null : trackNames.get(slot.getTrackId()),
                    w == null ? "NONE" : w.getScoreType(),
                    s.isRx(), s.getTimeSeconds(), s.getRounds(), s.getReps(), s.getLoad(), s.isFinished()));
        }
        return out;
    }

    @GetMapping("/benchmark-history")
    @Transactional(readOnly = true)
    public List<BenchmarkHistoryDto> benchmarkHistory() {
        UUID mid = scoreService.callerMembershipId();
        Map<UUID, ProgramSlot> slotById = slots.findAll().stream()
                .collect(Collectors.toMap(ProgramSlot::getId, s -> s, (a, b) -> a));
        Map<UUID, Wod> wodById = wods.findAll().stream().collect(Collectors.toMap(Wod::getId, w -> w, (a, b) -> a));
        Map<UUID, String> benchmarkNames = benchmarks.findAll().stream()
                .collect(Collectors.toMap(BenchmarkTemplate::getId, BenchmarkTemplate::getName, (a, b) -> a));

        // caller's scores whose slot WOD is a cloned benchmark, grouped by benchmark template
        Map<UUID, List<WodScore>> byBenchmark = new java.util.HashMap<>();
        Map<UUID, String> scoreTypeByBenchmark = new java.util.HashMap<>();
        for (WodScore s : scores.findByMembershipIdOrderByCreatedAtDesc(mid)) {
            ProgramSlot slot = slotById.get(s.getSlotId());
            Wod w = slot == null ? null : wodById.get(slot.getWodId());
            if (w == null || w.getBenchmarkTemplateId() == null) continue;
            byBenchmark.computeIfAbsent(w.getBenchmarkTemplateId(), k -> new ArrayList<>()).add(s);
            scoreTypeByBenchmark.put(w.getBenchmarkTemplateId(), w.getScoreType());
        }

        List<BenchmarkHistoryDto> out = new ArrayList<>();
        for (var e : byBenchmark.entrySet()) {
            String scoreType = scoreTypeByBenchmark.get(e.getKey());
            WodScore b = Leaderboard.best(e.getValue(), scoreType);
            if (b == null) continue;
            out.add(new BenchmarkHistoryDto(benchmarkNames.getOrDefault(e.getKey(), "—"), scoreType,
                    b.getTimeSeconds(), b.getRounds(), b.getReps(), b.getLoad(),
                    slotById.get(b.getSlotId()) == null ? null : slotById.get(b.getSlotId()).getSlotDate()));
        }
        out.sort((a, c) -> a.benchmarkName().compareToIgnoreCase(c.benchmarkName()));
        return out;
    }
}
