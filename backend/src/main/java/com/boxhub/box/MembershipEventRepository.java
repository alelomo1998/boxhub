package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@link MembershipEvent} is {@code @TenantId} — every derived query here is silently filtered to
 * the caller's box (docs/TENANCY.md §1). Plain derived queries only; no native query and no
 * {@code runAsRoot} caller belongs in this class — the platform-wide churn read across boxes is
 * M18's, deliberately not built here (see V29's M-1 comment).
 */
public interface MembershipEventRepository extends JpaRepository<MembershipEvent, UUID> {

    /** One member's timeline, oldest first — the LEG read. */
    List<MembershipEvent> findByMembershipIdOrderByCreatedAtAsc(UUID membershipId);

    /** The box's events of a kind in a window — the churn read. */
    List<MembershipEvent> findByKindAndCreatedAtBetween(String kind, Instant from, Instant to);
}
