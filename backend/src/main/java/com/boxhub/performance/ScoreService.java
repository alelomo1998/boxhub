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

    @Transactional(readOnly = true)
    public Optional<WodScore> mine(UUID itemId) {
        items.findById(itemId).orElseThrow(NoSuchElementException::new);
        return scores.findBySessionItemIdAndMembershipId(itemId, callerMembershipId());
    }
}
