package com.boxhub.performance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WodScoreRepository extends JpaRepository<WodScore, UUID> {
    Optional<WodScore> findBySlotIdAndMembershipId(UUID slotId, UUID membershipId);
    List<WodScore> findBySlotId(UUID slotId);
    List<WodScore> findByMembershipIdOrderByCreatedAtDesc(UUID membershipId);
}
