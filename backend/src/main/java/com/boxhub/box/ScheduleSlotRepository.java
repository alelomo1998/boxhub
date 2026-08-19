package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ScheduleSlotRepository extends JpaRepository<ScheduleSlot, UUID> {
    List<ScheduleSlot> findByActiveTrue();
    List<ScheduleSlot> findByClassTypeId(UUID classTypeId);
}
