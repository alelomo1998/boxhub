package com.boxhub.performance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WodScoreRepository extends JpaRepository<WodScore, UUID> {
    Optional<WodScore> findBySessionItemIdAndMembershipId(UUID sessionItemId, UUID membershipId);
    List<WodScore> findBySessionItemId(UUID sessionItemId);
    List<WodScore> findByMembershipIdOrderByCreatedAtDesc(UUID membershipId);
}
