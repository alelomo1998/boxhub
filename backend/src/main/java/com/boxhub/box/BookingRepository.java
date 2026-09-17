package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BookingRepository extends JpaRepository<Booking, UUID> {
    List<Booking> findBySessionId(UUID sessionId);
    List<Booking> findByMembershipId(UUID membershipId);

    // Batch form of findBySessionId, for a caller that needs bookings for N sessions in one query
    // (AnnouncementController#targets). @TenantId on Booking keeps this box-filtered automatically.
    List<Booking> findBySessionIdIn(Collection<UUID> sessionIds);

    /**
     * GET /api/me/export is served to a BOXLESS session (a user token carries no box_id), so the
     * derived method above is filtered to the NO_TENANT sentinel and returns EMPTY — the GDPR
     * export silently shipped without bookings from M21 until M22 measured it. Native here, and
     * safe: membership_id is itself a per-box key (a membership belongs to exactly one box), so
     * the row set cannot cross a box boundary. Registered in docs/TENANCY.md §6.
     *
     * Export only. Box-scoped callers keep the filtered derived method, which stays as
     * defence-in-depth for any future caller whose membership id is not token-derived.
     */
    @Query(value = "select * from bookings where membership_id = :mid", nativeQuery = true)
    List<Booking> findByMembershipIdForExport(@Param("mid") UUID membershipId);

    /**
     * Same boxless-export reasoning as findByMembershipIdForExport, for a drop-in visitor's own
     * bookings (M22: visitor_user_id, no membership at all). Safe natively: visitor_user_id is
     * exactly the id this export belongs to, so a cross-box return is the point, not a leak.
     * docs/TENANCY.md §6.
     */
    @Query(value = "select * from bookings where visitor_user_id = :uid", nativeQuery = true)
    List<Booking> findByVisitorUserIdForExport(@Param("uid") UUID visitorUserId);
    // Cancellation is a status transition now, not a delete (M14a) — CANCELLED rows stay in the
    // table forever, so every caller that wants "the booking that currently holds a place" must
    // exclude them explicitly, or a cancelled row reads back as still active.
    Optional<Booking> findBySessionIdAndMembershipIdAndStatusNot(UUID sessionId, UUID membershipId, String status);
    long countBySessionIdAndStatus(UUID sessionId, String status);
    // A checked-in athlete still holds their place: capacity and "N booked" count BOTH statuses.
    List<String> IN_CLASS = List.of("BOOKED", "CHECKED_IN");
    long countBySessionIdAndStatusIn(UUID sessionId, Collection<String> statuses);
    List<Booking> findBySessionIdAndStatusInOrderByPosition(UUID sessionId, Collection<String> statuses);
    List<Booking> findBySessionIdAndStatusOrderByPosition(UUID sessionId, String status);
    boolean existsBySessionIdAndStatusIn(UUID sessionId, List<String> statuses);
    // Regeneration deletes in-range sessions; bookings.session_id has no ON DELETE CASCADE (V3), so
    // dependent rows (necessarily CANCELLED only — anything else would have blocked the delete) are
    // cleared first. See SlotRegenerationService.
    void deleteBySessionIdIn(List<UUID> sessionIds);

    // Athlete's booked/checked-in count in a time window. HomeController only, since M16a: the plan
    // weekly limit moved to entitlement_usage, which regeneration cannot delete from (see
    // EntitlementUsage). This counts what the athlete DID, not what they have consumed.
    @Query(value = """
            select count(*) from bookings b join class_sessions s on s.id = b.session_id
            where b.membership_id = :mid and b.status in ('BOOKED','CHECKED_IN')
              and s.start_at >= :weekStart and s.start_at < :weekEnd
            """, nativeQuery = true)
    long countInWeek(@Param("mid") UUID membershipId,
                     @Param("weekStart") Instant weekStart, @Param("weekEnd") Instant weekEnd);

    // Start times of the athlete's CHECKED_IN classes in a window — Home's "days attended" strip.
    // JPQL on purpose: both entities are @TenantId, so this stays inside the caller's box.
    @Query("""
            select s.startAt from Booking b, ClassSession s
            where s.id = b.sessionId and b.membershipId = :mid and b.status = 'CHECKED_IN'
              and s.startAt >= :from and s.startAt < :to
            """)
    List<Instant> attendedStartsBetween(@Param("mid") UUID membershipId,
                                        @Param("from") Instant from, @Param("to") Instant to);
}
