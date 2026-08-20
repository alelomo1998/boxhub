package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface CoachTimeOffRepository extends JpaRepository<CoachTimeOff, UUID> {
    List<CoachTimeOff> findByUserIdOrderByStartsAt(UUID userId);
    void deleteByUserId(UUID userId);
}
