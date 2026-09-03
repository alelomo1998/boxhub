package com.boxhub.notify;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /**
     * Page one of the feed. Keyset, not offset: an emit between two page fetches would shift an
     * offset window and silently skip a row. `types` is the showsInFeed set, passed by the caller
     * so the enum stays the single declaration of what the feed shows.
     */
    @Query("""
           select n from Notification n
            where n.membershipId = :mid and n.type in :types
            order by n.createdAt desc, n.id desc
           """)
    List<Notification> firstPage(@Param("mid") UUID membershipId,
                                 @Param("types") List<String> types, Pageable page);

    /** Later pages. The id tiebreak matters: emitAll writes many rows at one Instant. */
    @Query("""
           select n from Notification n
            where n.membershipId = :mid and n.type in :types
              and (n.createdAt < :ts or (n.createdAt = :ts and n.id < :id))
            order by n.createdAt desc, n.id desc
           """)
    List<Notification> pageAfter(@Param("mid") UUID membershipId, @Param("types") List<String> types,
                                 @Param("ts") Instant cursorCreatedAt, @Param("id") UUID cursorId,
                                 Pageable page);

    /**
     * Half of the bell's count. NEW_ANNOUNCEMENT is excluded here and counted from
     * announcement_recipient instead — one marker, two readers (D-3).
     */
    @Query("""
           select count(n) from Notification n
            where n.membershipId = :mid and n.type in :types and n.readAt is null
           """)
    long countUnread(@Param("mid") UUID membershipId, @Param("types") List<String> types);

    /** The dedupe check. The partial unique index is the guarantee; this is the control flow. */
    boolean existsByMembershipIdAndTypeAndDedupeKey(UUID membershipId, String type, String dedupeKey);

    /** Member-scoped: a member marking one read can only ever reach their OWN row. */
    Optional<Notification> findByIdAndMembershipId(UUID id, UUID membershipId);

    List<Notification> findByMembershipIdAndTypeInAndReadAtIsNull(UUID membershipId, List<String> types);

    /** Retention (spec §8). Deliberately tenant-agnostic: called by PurgeJob under runAsRoot. */
    @org.springframework.data.jpa.repository.Modifying
    @Query(value = "delete from notification where created_at < :cutoff", nativeQuery = true)
    int purge(@Param("cutoff") Instant cutoff);
}
