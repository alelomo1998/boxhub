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

    // findLatestBodyForMember is DELIBERATELY NOT HERE. It orders by `a.sentAt`, and JPQL is
    // validated at context startup against ENTITY PROPERTY names — the Announcement field is still
    // called `updatedAt` until Task 5 renames it, so this query would fail the whole context to boot.
    // Task 5 Step 0 adds it, immediately after the rename. Do not add it early.

    long countByAnnouncementId(UUID announcementId);
    long countByAnnouncementIdAndReadAtIsNotNull(UUID announcementId);
}
