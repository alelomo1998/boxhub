package com.boxhub.display;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface ClassTimerRepository extends JpaRepository<ClassTimer, UUID> {
    Optional<ClassTimer> findBySessionId(UUID sessionId);
}
