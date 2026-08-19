package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface BoxHoursRepository extends JpaRepository<BoxHours, UUID> {
    List<BoxHours> findByBoxIdOrderByWeekdayAscOpenTimeAsc(UUID boxId);
    List<BoxHours> findByBoxIdIn(Collection<UUID> boxIds);
}
