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

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ClassSession s where s.id = :id")
    Optional<ClassSession> findWithLockById(@Param("id") UUID id);
}
