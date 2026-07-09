package com.boxhub.performance;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.programming.ProgramSlot;
import com.boxhub.programming.ProgramSlotRepository;
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
    private final ProgramSlotRepository slots;
    private final MembershipRepository memberships;

    public ScoreService(WodScoreRepository scores, ProgramSlotRepository slots, MembershipRepository memberships) {
        this.scores = scores;
        this.slots = slots;
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

    @Transactional
    public WodScore upsert(UUID slotId, ScoreInput in) {
        ProgramSlot slot = slots.findById(slotId).orElseThrow(NoSuchElementException::new); // tenant-filtered -> foreign 404
        if (!"PUBLISHED".equals(slot.getStatus())) throw new NoSuchElementException(); // drafts invisible to athletes
        UUID mid = callerMembershipId();
        WodScore s = scores.findBySlotIdAndMembershipId(slotId, mid).orElseGet(WodScore::new);
        s.setSlotId(slotId);
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
    public Optional<WodScore> mine(UUID slotId) {
        slots.findById(slotId).orElseThrow(NoSuchElementException::new);
        return scores.findBySlotIdAndMembershipId(slotId, callerMembershipId());
    }
}
