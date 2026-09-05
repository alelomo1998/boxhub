package com.boxhub.box;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /** Sessions starting inside a window. The reminder sweep's only read; indexed on start_at. */
    List<ClassSession> findByStatusAndStartAtBetween(String status, Instant from, Instant to);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ClassSession s where s.id = :id")
    Optional<ClassSession> findWithLockById(@Param("id") UUID id);
}
