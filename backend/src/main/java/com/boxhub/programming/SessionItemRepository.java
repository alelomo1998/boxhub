package com.boxhub.programming;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface SessionItemRepository extends JpaRepository<SessionItem, UUID> {
    List<SessionItem> findBySessionIdOrderBySortOrderAsc(UUID sessionId);
    List<SessionItem> findBySessionIdInOrderBySortOrderAsc(List<UUID> sessionIds);
    void deleteBySessionId(UUID sessionId);
    boolean existsByWodId(UUID wodId);

    /** One class-owned piece as it was programmed. Wod is an entity; the controller maps it. */
    record HistoryRow(UUID itemId, UUID sessionId, String className, Instant startAt, Wod wod) {}

    // JPQL on purpose: SessionItem, ClassSession and Wod are all @TenantId, so Hibernate box-filters
    // every root -- exactly what this read wants. Native SQL would bypass that filter.
    @Query("""
            select new com.boxhub.programming.SessionItemRepository$HistoryRow(i.id, s.id, s.name, s.startAt, w)
            from SessionItem i, com.boxhub.box.ClassSession s, Wod w
            where i.sessionId = s.id and i.wodId = w.id
              and w.library = false and s.status <> 'CANCELLED'
              and s.startAt < :upper
              and lower(w.title) like :pattern
            order by s.startAt desc, i.sortOrder asc
            """)
    List<HistoryRow> history(@Param("upper") Instant upper, @Param("pattern") String pattern, Pageable page);
}
