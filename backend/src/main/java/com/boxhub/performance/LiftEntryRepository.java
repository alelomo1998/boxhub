package com.boxhub.performance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public interface LiftEntryRepository extends JpaRepository<LiftEntry, UUID> {
    List<LiftEntry> findByMembershipIdAndMovementIdOrderByPerformedOnAsc(UUID membershipId, UUID movementId);
    List<LiftEntry> findByMembershipIdOrderByPerformedOnDesc(UUID membershipId);

    @Query("select coalesce(max(l.load), 0) from LiftEntry l where l.membershipId = :m and l.movementId = :mv")
    BigDecimal maxLoad(@Param("m") UUID membershipId, @Param("mv") UUID movementId);
}
