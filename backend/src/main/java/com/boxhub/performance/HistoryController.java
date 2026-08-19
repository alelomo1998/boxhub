package com.boxhub.performance;

import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.programming.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box")
public class HistoryController {

    private final WodScoreRepository scores;
    private final SessionItemRepository items;
    private final ClassSessionRepository sessions;
    private final WodRepository wods;
    private final BenchmarkTemplateRepository benchmarks;
    private final ScoreService scoreService;

    public HistoryController(WodScoreRepository scores, SessionItemRepository items, ClassSessionRepository sessions,
                             WodRepository wods, BenchmarkTemplateRepository benchmarks, ScoreService scoreService) {
        this.scores = scores;
        this.items = items;
        this.sessions = sessions;
        this.wods = wods;
        this.benchmarks = benchmarks;
        this.scoreService = scoreService;
    }

    public record MyScoreDto(UUID itemId, LocalDate day, String className, String wodTitle, String scoreType,
                             boolean rx, Integer timeSeconds, Integer rounds, Integer reps, BigDecimal load,
                             boolean finished) {}
    public record BenchmarkHistoryDto(String benchmarkName, String scoreType, Integer timeSeconds, Integer rounds,
                                      Integer reps, BigDecimal load, LocalDate achievedOn) {}

    private record Ctx(SessionItem item, ClassSession session, Wod wod) {}

    private Map<UUID, Ctx> contextFor(List<WodScore> myScores) {
        Map<UUID, SessionItem> itemById = items.findAll().stream()
                .collect(Collectors.toMap(SessionItem::getId, i -> i, (a, b) -> a));
        Map<UUID, ClassSession> sessionById = sessions.findAll().stream()
                .collect(Collectors.toMap(ClassSession::getId, s -> s, (a, b) -> a));
        Map<UUID, Wod> wodById = wods.findAll().stream().collect(Collectors.toMap(Wod::getId, w -> w, (a, b) -> a));
        return myScores.stream().collect(Collectors.toMap(WodScore::getSessionItemId, s -> {
            SessionItem i = itemById.get(s.getSessionItemId());
            ClassSession cs = i == null ? null : sessionById.get(i.getSessionId());
            Wod w = i == null ? null : wodById.get(i.getWodId());
            return new Ctx(i, cs, w);
        }, (a, b) -> a));
    }

    private static LocalDate day(Instant startAt) {
        return startAt == null ? null : startAt.atZone(ZoneId.systemDefault()).toLocalDate();
    }

    @GetMapping("/my-scores")
    @Transactional(readOnly = true)
    public List<MyScoreDto> myScores() {
        UUID mid = scoreService.callerMembershipId();
        List<WodScore> mine = scores.findByMembershipIdOrderByCreatedAtDesc(mid);
        Map<UUID, Ctx> ctx = contextFor(mine);
        List<MyScoreDto> out = new ArrayList<>();
        for (WodScore s : mine) {
            Ctx c = ctx.get(s.getSessionItemId());
            String scoreType = (c == null || c.item() == null) ? "NONE" : c.item().getScoreType(); // explicit (M14a)
            out.add(new MyScoreDto(s.getSessionItemId(),
                    c == null || c.session() == null ? null : day(c.session().getStartAt()),
                    c == null || c.session() == null ? null : c.session().getName(),
                    c == null || c.wod() == null ? null : c.wod().getTitle(),
                    scoreType, s.isRx(), s.getTimeSeconds(), s.getRounds(), s.getReps(), s.getLoad(), s.isFinished()));
        }
        return out;
    }

    @GetMapping("/benchmark-history")
    @Transactional(readOnly = true)
    public List<BenchmarkHistoryDto> benchmarkHistory() {
        UUID mid = scoreService.callerMembershipId();
        List<WodScore> mine = scores.findByMembershipIdOrderByCreatedAtDesc(mid);
        Map<UUID, Ctx> ctx = contextFor(mine);
        Map<UUID, String> benchmarkNames = benchmarks.findAll().stream()
                .collect(Collectors.toMap(BenchmarkTemplate::getId, BenchmarkTemplate::getName, (a, b) -> a));

        Map<UUID, List<WodScore>> byBenchmark = new java.util.HashMap<>();
        Map<UUID, String> scoreTypeByBenchmark = new java.util.HashMap<>();
        for (WodScore s : mine) {
            Ctx c = ctx.get(s.getSessionItemId());
            if (c == null || c.wod() == null || c.wod().getBenchmarkTemplateId() == null || c.item() == null) continue;
            UUID bid = c.wod().getBenchmarkTemplateId();
            byBenchmark.computeIfAbsent(bid, k -> new ArrayList<>()).add(s);
            scoreTypeByBenchmark.put(bid, c.item().getScoreType()); // explicit now (M14a)
        }

        List<BenchmarkHistoryDto> out = new ArrayList<>();
        for (var e : byBenchmark.entrySet()) {
            String scoreType = scoreTypeByBenchmark.get(e.getKey());
            WodScore b = Leaderboard.best(e.getValue(), scoreType);
            if (b == null) continue;
            Ctx c = ctx.get(b.getSessionItemId());
            out.add(new BenchmarkHistoryDto(benchmarkNames.getOrDefault(e.getKey(), "—"), scoreType,
                    b.getTimeSeconds(), b.getRounds(), b.getReps(), b.getLoad(),
                    c == null || c.session() == null ? null : day(c.session().getStartAt())));
        }
        out.sort((a, c) -> a.benchmarkName().compareToIgnoreCase(c.benchmarkName()));
        return out;
    }
}
