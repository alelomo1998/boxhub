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
    Optional<Booking> findBySessionIdAndMembershipId(UUID sessionId, UUID membershipId);
    long countBySessionIdAndStatus(UUID sessionId, String status);
    List<Booking> findBySessionIdAndStatusOrderByPosition(UUID sessionId, String status);

    // Athlete's booked/checked-in count in a time window (plan weekly-limit).
    @Query(value = """
            select count(*) from bookings b join class_sessions s on s.id = b.session_id
            where b.membership_id = :mid and b.status in ('BOOKED','CHECKED_IN')
              and s.start_at >= :weekStart and s.start_at < :weekEnd
            """, nativeQuery = true)
    long countInWeek(@Param("mid") UUID membershipId,
                     @Param("weekStart") Instant weekStart, @Param("weekEnd") Instant weekEnd);
}
