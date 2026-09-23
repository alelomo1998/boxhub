package com.boxhub.box;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClassSessionRepository extends JpaRepository<ClassSession, UUID> {
    List<ClassSession> findByStartAtBetweenOrderByStartAt(Instant from, Instant to);

    boolean existsByScheduleSlotIdAndStartAt(UUID scheduleSlotId, Instant startAt);

    List<ClassSession> findByStatusAndStartAtBefore(String status, Instant before);

    List<ClassSession> findByScheduleSlotIdAndStartAtGreaterThanEqual(UUID scheduleSlotId, Instant from);

    // Home's habit suggestion: a slot's SCHEDULED sessions in the booking window, earliest first.
    List<ClassSession> findByScheduleSlotIdAndStatusAndStartAtBetweenOrderByStartAt(
            UUID scheduleSlotId, String status, Instant from, Instant to);

    /** Sessions starting inside a window. The reminder sweep's only read; indexed on start_at. */
    List<ClassSession> findByStatusAndStartAtBetween(String status, Instant from, Instant to);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ClassSession s where s.id = :id")
    Optional<ClassSession> findWithLockById(@Param("id") UUID id);

    /**
     * Renames a type's not-yet-started sessions in place. ClassSession.name is a snapshot taken at
     * generation (SessionGenerator:84), so without this a rename leaves every already-generated
     * session carrying the old name until the horizon rolls over.
     *
     * Bounded to startAt >= now so history keeps the name it actually ran under.
     *
     * ClassSession is @TenantId, so this bulk update is silently scoped to the caller's box — which
     * is CORRECT here (the caller is the box). See docs/TENANCY.md: the trap is a query that needs to
     * be tenant-AGNOSTIC, which this is not.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update ClassSession s set s.name = :name where s.scheduleSlotId in :slotIds and s.startAt >= :now")
    int renameFutureSessions(@Param("slotIds") List<UUID> slotIds, @Param("name") String name, @Param("now") Instant now);
}
