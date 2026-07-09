package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProgramSlotRepository extends JpaRepository<ProgramSlot, UUID> {
    List<ProgramSlot> findBySlotDateBetweenOrderBySlotDateAsc(LocalDate from, LocalDate to);
    List<ProgramSlot> findBySlotDateBetweenAndTrackIdOrderBySlotDateAsc(LocalDate from, LocalDate to, UUID trackId);
    List<ProgramSlot> findBySlotDate(LocalDate slotDate);
    List<ProgramSlot> findBySlotDateAndStatus(LocalDate slotDate, String status);
    Optional<ProgramSlot> findBySlotDateAndTrackId(LocalDate slotDate, UUID trackId);
    boolean existsByWodId(UUID wodId);
}
