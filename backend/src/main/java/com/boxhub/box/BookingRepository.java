package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BookingRepository extends JpaRepository<Booking, UUID> {
    List<Booking> findBySessionId(UUID sessionId);
    List<Booking> findByMembershipId(UUID membershipId);
    // Cancellation is a status transition now, not a delete (M14a) — CANCELLED rows stay in the
    // table forever, so every caller that wants "the booking that currently holds a place" must
    // exclude them explicitly, or a cancelled row reads back as still active.
    Optional<Booking> findBySessionIdAndMembershipIdAndStatusNot(UUID sessionId, UUID membershipId, String status);
    long countBySessionIdAndStatus(UUID sessionId, String status);
    List<Booking> findBySessionIdAndStatusOrderByPosition(UUID sessionId, String status);
    boolean existsBySessionIdAndStatusIn(UUID sessionId, List<String> statuses);
    // Regeneration deletes in-range sessions; bookings.session_id has no ON DELETE CASCADE (V3), so
    // dependent rows (necessarily CANCELLED only — anything else would have blocked the delete) are
    // cleared first. See SlotRegenerationService.
    void deleteBySessionIdIn(List<UUID> sessionIds);

    // Athlete's booked/checked-in count in a time window (plan weekly-limit).
    @Query(value = """
            select count(*) from bookings b join class_sessions s on s.id = b.session_id
            where b.membership_id = :mid and b.status in ('BOOKED','CHECKED_IN')
              and s.start_at >= :weekStart and s.start_at < :weekEnd
            """, nativeQuery = true)
    long countInWeek(@Param("mid") UUID membershipId,
                     @Param("weekStart") Instant weekStart, @Param("weekEnd") Instant weekEnd);
}
