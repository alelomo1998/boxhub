package com.boxhub.performance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WodScoreRepository extends JpaRepository<WodScore, UUID> {
    Optional<WodScore> findBySessionItemIdAndMembershipId(UUID sessionItemId, UUID membershipId);
    List<WodScore> findBySessionItemId(UUID sessionItemId);
    List<WodScore> findByMembershipIdOrderByCreatedAtDesc(UUID membershipId);
    long countBySessionItemIdIn(List<UUID> sessionItemIds);

    /**
     * Which of these session items carry at least one score. One query answers both of
     * SessionItemController#replace's guards — "you may not delete a scored piece" and "you may not
     * re-point a scored piece at a different workout" — so neither has to ask per item.
     */
    @Query("select distinct s.sessionItemId from WodScore s where s.sessionItemId in :ids")
    List<UUID> findScoredItemIds(@Param("ids") List<UUID> ids);

    /** Boxless GDPR export — see BookingRepository#findByMembershipIdForExport. docs/TENANCY.md §6. */
    @Query(value = "select * from wod_score where membership_id = :mid order by created_at desc",
           nativeQuery = true)
    List<WodScore> findByMembershipIdForExport(@Param("mid") UUID membershipId);
}
