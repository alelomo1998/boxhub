package com.boxhub.box;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AnnouncementRecipientRepository extends JpaRepository<AnnouncementRecipient, UUID> {

    /** Member-scoped (spec §4): a member marking an announcement read can only reach their OWN row. */
    Optional<AnnouncementRecipient> findByMembershipIdAndAnnouncementId(UUID membershipId, UUID announcementId);

    /** Every announcement addressed to this member, newest first. Member-scoped. */
    @Query("""
           select r from AnnouncementRecipient r
            where r.membershipId = :mid
           """)
    List<AnnouncementRecipient> findMineRaw(@Param("mid") UUID membershipId);

    /**
     * The athlete home card: the newest announcement ADDRESSED TO ME (D-4). Entity join —
     * Hibernate 6 supports `join Entity alias on …` without a mapped association. Both entities are
     * @TenantId, so the box filter applies to both sides. Call with PageRequest.of(0, 1).
     */
    @Query("""
           select a from Announcement a
             join AnnouncementRecipient r on r.announcementId = a.id
            where r.membershipId = :mid
            order by a.sentAt desc
           """)
    List<Announcement> findLatestBodyForMember(@Param("mid") UUID membershipId, Pageable page);

    long countByAnnouncementId(UUID announcementId);
    long countByAnnouncementIdAndReadAtIsNotNull(UUID announcementId);

    /** The home card's badge: how many announcements addressed to me are still unread. Member-scoped. */
    long countByMembershipIdAndReadAtIsNull(UUID membershipId);

    /** Every recipient row for one announcement — the sender-only recipients view. Box-filtered. */
    List<AnnouncementRecipient> findByAnnouncementId(UUID announcementId);
}
