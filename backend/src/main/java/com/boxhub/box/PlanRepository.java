package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlanRepository extends JpaRepository<Plan, UUID> {
    List<Plan> findByArchivedFalse();

    // Explicit box_id equality on top of the @TenantId auto-filter — belt and suspenders for the
    // one caller (SubscriptionService.comp) that must find-or-create the per-box synthetic plan
    // exactly once; see docs/TENANCY.md.
    Optional<Plan> findByBoxIdAndName(UUID boxId, String name);
}
