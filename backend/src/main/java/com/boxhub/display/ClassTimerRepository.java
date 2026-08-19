package com.boxhub.display;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClassTimerRepository extends JpaRepository<ClassTimer, UUID> {
    Optional<ClassTimer> findBySessionId(UUID sessionId);
    // class_timers.session_id has no ON DELETE CASCADE (V9) — see SlotRegenerationService.
    void deleteBySessionIdIn(List<UUID> sessionIds);
}
