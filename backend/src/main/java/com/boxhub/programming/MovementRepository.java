package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface MovementRepository extends JpaRepository<Movement, UUID> {
    // Movement is not @TenantId, so JPQL is NOT tenant-filtered: bind the box explicitly and
    // return globals (box_id null) plus the caller's own custom movements.
    @Query("select m from Movement m where m.active = true and (m.boxId is null or m.boxId = :box) order by lower(m.name)")
    List<Movement> findVisible(@Param("box") UUID boxId);
}
