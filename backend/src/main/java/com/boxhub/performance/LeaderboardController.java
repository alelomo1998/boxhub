package com.boxhub.performance;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.programming.ProgramSlotRepository;
import com.boxhub.programming.WodRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box/program")
public class LeaderboardController {

    private final WodScoreRepository scores;
    private final ProgramSlotRepository slots;
    private final WodRepository wods;
    private final MembershipRepository memberships;

    public LeaderboardController(WodScoreRepository scores, ProgramSlotRepository slots, WodRepository wods,
                                 MembershipRepository memberships) {
        this.scores = scores;
        this.slots = slots;
        this.wods = wods;
        this.memberships = memberships;
    }

    public record Entry(int rank, String athleteName, boolean rx, Integer timeSeconds, Integer rounds,
                        Integer reps, BigDecimal load, boolean finished) {}
    public record LeaderboardDto(String scoreType, List<Entry> entries) {}

    @GetMapping("/{slotId}/leaderboard")
    @Transactional(readOnly = true)
    public LeaderboardDto leaderboard(@PathVariable UUID slotId) {
        var slot = slots.findById(slotId).orElseThrow(NoSuchElementException::new); // foreign/absent -> 404
        String scoreType = wods.findById(slot.getWodId()).map(w -> w.getScoreType()).orElse("NONE");
        List<WodScore> ranked = Leaderboard.rank(scores.findBySlotId(slotId), scoreType);

        Map<UUID, String> names = memberships.findAll().stream()
                .collect(Collectors.toMap(Membership::getId, m -> m.getUser().getName(), (a, b) -> a));

        List<Entry> entries = new java.util.ArrayList<>();
        int rank = 1;
        for (WodScore s : ranked) {
            entries.add(new Entry(rank++, names.getOrDefault(s.getMembershipId(), "—"),
                    s.isRx(), s.getTimeSeconds(), s.getRounds(), s.getReps(), s.getLoad(), s.isFinished()));
        }
        return new LeaderboardDto(scoreType, entries);
    }
}
