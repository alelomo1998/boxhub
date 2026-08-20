package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;
public interface WodRatingRepository extends JpaRepository<WodRating, UUID> {
    List<WodRating> findByUserId(UUID userId);

    /**
     * Boxless GDPR export — see BookingRepository#findByMembershipIdForExport in com.boxhub.box.
     * WodRating is @TenantId, so the derived findByUserId above resolves NO_TENANT on
     * GET /api/me/export's boxless session. Safe natively: user_id is exactly the id this export
     * belongs to, so a cross-box return is the point, not a leak. docs/TENANCY.md §6.
     */
    @Query(value = "select * from wod_rating where user_id = :uid", nativeQuery = true)
    List<WodRating> findByUserIdForExport(@Param("uid") UUID userId);
}
