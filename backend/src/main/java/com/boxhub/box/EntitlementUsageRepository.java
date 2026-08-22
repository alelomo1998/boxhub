package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EntitlementUsageRepository extends JpaRepository<EntitlementUsage, UUID> {

    /**
     * Consumption in one window. JPQL, so Hibernate's @TenantId filter applies — which is correct
     * here and load-bearing: every caller is a request thread acting inside one box, and a count that
     * crossed boxes would let a member's other box eat this box's allowance.
     * <p>
     * `refunded = false` also covers CANCELLATION rows, which are never refunded — one query, both kinds.
     */
    @Query("""
            select count(u) from EntitlementUsage u
            where u.membershipId = :mid and u.kind = :kind and u.refunded = false
              and u.sessionStartAt >= :from and u.sessionStartAt < :to
            """)
    long countInWindow(@Param("mid") UUID membershipId, @Param("kind") String kind,
                       @Param("from") Instant from, @Param("to") Instant to);

    /** The refund lookup. booking_id has no FK, but it is still the handle on the row to flip. */
    Optional<EntitlementUsage> findByBookingIdAndKind(UUID bookingId, String kind);
}
