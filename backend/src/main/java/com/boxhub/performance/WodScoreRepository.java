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

    /** Boxless GDPR export — see BookingRepository#findByMembershipIdForExport. docs/TENANCY.md §6. */
    @Query(value = "select * from wod_score where membership_id = :mid order by created_at desc",
           nativeQuery = true)
    List<WodScore> findByMembershipIdForExport(@Param("mid") UUID membershipId);
}
