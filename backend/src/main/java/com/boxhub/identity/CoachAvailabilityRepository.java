package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface CoachAvailabilityRepository extends JpaRepository<CoachAvailability, UUID> {
    List<CoachAvailability> findByUserIdOrderByWeekdayAscStartTimeAsc(UUID userId);
    void deleteByUserId(UUID userId);
}
