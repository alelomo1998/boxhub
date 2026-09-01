package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AnnouncementRepository extends JpaRepository<Announcement, UUID> {
    List<Announcement> findAll(); // tenant-filtered: at most one row for the caller's box

    /** History, newest first. Box-filtered by @TenantId; staff-only surface. */
    List<Announcement> findAllByOrderBySentAtDesc();

    /**
     * A caller's OWN outbox, newest first. Box-filtered by @TenantId. A null sentBy (system/seed
     * sends, V30's backfill) never matches any real UUID, so those rows appear in nobody's history —
     * deliberate, not a bug.
     */
    List<Announcement> findBySentByOrderBySentAtDesc(UUID sentBy);
}
