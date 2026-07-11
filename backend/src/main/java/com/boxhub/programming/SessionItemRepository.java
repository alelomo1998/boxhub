package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SessionItemRepository extends JpaRepository<SessionItem, UUID> {
    List<SessionItem> findBySessionIdOrderBySortOrderAsc(UUID sessionId);
    List<SessionItem> findBySessionIdInOrderBySortOrderAsc(List<UUID> sessionIds);
    void deleteBySessionId(UUID sessionId);
    boolean existsByWodId(UUID wodId);
}
