package com.boxhub.performance;

import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.programming.SessionItem;
import com.boxhub.programming.SessionItemRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
public class ScoreService {

    private final WodScoreRepository scores;
    private final SessionItemRepository items;
    private final ClassSessionRepository sessions;
    private final MembershipRepository memberships;

    public ScoreService(WodScoreRepository scores, SessionItemRepository items,
                        ClassSessionRepository sessions, MembershipRepository memberships) {
        this.scores = scores;
        this.items = items;
        this.sessions = sessions;
        this.memberships = memberships;
    }

    /** The caller's own membership in the active box. Never trust a membership id from the request. */
    public UUID callerMembershipId() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"))
                .getId();
    }

    public record ScoreInput(boolean rx, Integer timeSeconds, Integer rounds, Integer reps, BigDecimal load,
                             Boolean finished, String notes, boolean isPrivate) {}

    /** An item is loggable only when its class instance's programming is PUBLISHED and the item is scoreable. */
    SessionItem loggableItem(UUID itemId) {
        SessionItem item = items.findById(itemId).orElseThrow(NoSuchElementException::new); // tenant-filtered
        ClassSession session = sessions.findById(item.getSessionId()).orElseThrow(NoSuchElementException::new);
        if (!"PUBLISHED".equals(session.getProgrammingStatus())) throw new NoSuchElementException();
        if (!item.isScoreable()) throw new NoSuchElementException();
        return item;
    }

    @Transactional
    public WodScore upsert(UUID itemId, ScoreInput in) {
        loggableItem(itemId);
        UUID mid = callerMembershipId();
        WodScore s = scores.findBySessionItemIdAndMembershipId(itemId, mid).orElseGet(WodScore::new);
        s.setSessionItemId(itemId);
        s.setMembershipId(mid);
        s.setRx(in.rx());
        s.setTimeSeconds(in.timeSeconds());
        s.setRounds(in.rounds());
        s.setReps(in.reps());
        s.setLoad(in.load());
        s.setFinished(in.finished() == null || in.finished());
        s.setNotes(in.notes());
        s.setPrivate(in.isPrivate());
        s.setUpdatedAt(Instant.now());
        return scores.save(s);
    }

    /** Coach entry for a target athlete. membershipId is validated to be in the caller's box. loggedBy = coach. */
    @Transactional
    public WodScore upsertFor(UUID itemId, UUID targetMembershipId, ScoreInput in, UUID loggedByMembershipId) {
        loggableItem(itemId);
        memberships.findById(targetMembershipId)
                .filter(m -> TenantContext.requireBoxId().equals(m.getBox().getId()))
                .orElseThrow(NoSuchElementException::new); // foreign/unknown -> 404
        WodScore s = scores.findBySessionItemIdAndMembershipId(itemId, targetMembershipId).orElseGet(WodScore::new);
        boolean existing = s.getId() != null;
        s.setSessionItemId(itemId);
        s.setMembershipId(targetMembershipId);
        s.setTimeSeconds(in.timeSeconds()); s.setRounds(in.rounds()); s.setReps(in.reps());
        s.setLoad(in.load()); s.setFinished(in.finished() == null || in.finished());
        // Athlete-owned attributes (rx/private/notes): coach only sets these on a brand-new row.
        // On an existing row, never overwrite what the athlete already set (e.g. don't publicize a private score).
        if (!existing) {
            s.setRx(in.rx());
            s.setPrivate(in.isPrivate());
            s.setNotes(in.notes());
        }
        s.setLoggedBy(loggedByMembershipId);
        s.setUpdatedAt(Instant.now());
        return scores.save(s);
    }

    /**
     * A team result is N rows sharing one generated team_id -- one per member, each keeping its own
     * membership_id (spec 5.2). Deliberately NOT a team_score table: every leaderboard, history and
     * analytics read keys on membership_id, and a second shape would force each of them to union two
     * sources. All N rows are written in ONE transaction, so a partial team is impossible -- a
     * foreign or unknown membership rolls the whole result back.
     *
     * <p>Per-member writing is {@link #upsertFor}, unchanged: it validates the membership is in the
     * caller's box, it preserves athlete-owned attributes (rx/private/notes) on a row that already
     * exists, and it stamps logged_by. Whoever posts the team result is the logger.
     */
    @Transactional
    public List<WodScore> upsertTeam(UUID itemId, List<UUID> membershipIds, String teamName,
                                     ScoreInput in, UUID loggedByMembershipId) {
        UUID teamId = UUID.randomUUID();
        List<WodScore> out = new ArrayList<>();
        for (UUID membershipId : membershipIds) {
            WodScore s = upsertFor(itemId, membershipId, in, loggedByMembershipId);
            s.setTeamId(teamId);
            s.setTeamName(teamName);
            out.add(scores.save(s));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public Optional<WodScore> mine(UUID itemId) {
        items.findById(itemId).orElseThrow(NoSuchElementException::new);
        return scores.findBySessionItemIdAndMembershipId(itemId, callerMembershipId());
    }
}
