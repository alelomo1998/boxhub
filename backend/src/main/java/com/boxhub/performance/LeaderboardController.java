package com.boxhub.performance;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.programming.SessionItem;
import com.boxhub.programming.SessionItemController;
import com.boxhub.programming.SessionItemRepository;
import com.boxhub.programming.WodRepository;
import com.boxhub.shared.MediaSigner;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box/sessions/items")
public class LeaderboardController {

    private final WodScoreRepository scores;
    private final SessionItemRepository items;
    private final WodRepository wods;
    private final MembershipRepository memberships;
    private final MediaSigner mediaSigner;

    public LeaderboardController(WodScoreRepository scores, SessionItemRepository items, WodRepository wods,
                                 MembershipRepository memberships, MediaSigner mediaSigner) {
        this.scores = scores;
        this.items = items;
        this.wods = wods;
        this.memberships = memberships;
        this.mediaSigner = mediaSigner;
    }

    public record Entry(int rank, String athleteName, String avatarPath, boolean rx, Integer timeSeconds,
                        Integer rounds, Integer reps, BigDecimal load, boolean finished) {}
    public record LeaderboardDto(String scoreType, List<Entry> entries) {}

    private record Who(String name, String avatar) {}

    @GetMapping("/{itemId}/leaderboard")
    @Transactional(readOnly = true)
    public LeaderboardDto leaderboard(@PathVariable UUID itemId) {
        SessionItem item = items.findById(itemId).orElseThrow(NoSuchElementException::new); // foreign/absent -> 404
        String scoreType = wods.findById(item.getWodId())
                .map(w -> SessionItemController.effectiveScoreType(item, w)).orElse("NONE");
        List<WodScore> ranked = Leaderboard.rank(scores.findBySessionItemId(itemId), scoreType);

        Map<UUID, Who> who = memberships.findAll().stream()
                .collect(Collectors.toMap(Membership::getId,
                        m -> new Who(m.getUser().getName(), m.getAvatarPath()), (a, b) -> a));

        List<Entry> entries = new java.util.ArrayList<>();
        int rank = 1;
        for (WodScore s : ranked) {
            Who w = who.getOrDefault(s.getMembershipId(), new Who("—", null));
            entries.add(new Entry(rank++, w.name(), mediaSigner.sign(w.avatar()),
                    s.isRx(), s.getTimeSeconds(), s.getRounds(), s.getReps(), s.getLoad(), s.isFinished()));
        }
        return new LeaderboardDto(scoreType, entries);
    }
}
