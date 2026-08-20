package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface PtBookingRepository extends JpaRepository<PtBooking, UUID> {
    List<PtBooking> findByCoachMembershipIdOrderByStartsAt(UUID coachMembershipId);
    List<PtBooking> findByAthleteUserIdOrderByStartsAt(UUID athleteUserId);

    /**
     * Boxless GDPR export — see BookingRepository#findByMembershipIdForExport. PtBooking is
     * @TenantId, so the derived methods above resolve NO_TENANT and return empty when
     * GET /api/me/export runs on its boxless session. Safe natively: coach_membership_id is a
     * per-box key, so the row set cannot cross a box boundary. docs/TENANCY.md §6.
     */
    @Query(value = "select * from pt_booking where coach_membership_id = :mid order by starts_at",
           nativeQuery = true)
    List<PtBooking> findByCoachMembershipIdForExport(@Param("mid") UUID coachMembershipId);

    /**
     * Same boxless-export reasoning as above, keyed on the athlete instead. Safe natively:
     * athlete_user_id is exactly the id this export belongs to, so a cross-box return is the
     * point, not a leak. docs/TENANCY.md §6.
     */
    @Query(value = "select * from pt_booking where athlete_user_id = :uid order by starts_at",
           nativeQuery = true)
    List<PtBooking> findByAthleteUserIdForExport(@Param("uid") UUID athleteUserId);
}
