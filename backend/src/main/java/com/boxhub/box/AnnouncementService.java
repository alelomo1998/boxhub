package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Sending = resolve the audience, then freeze it as rows. One transaction (D-2). */
@Service
public class AnnouncementService {

    private final AnnouncementRepository announcements;
    private final AnnouncementRecipientRepository recipients;
    private final SegmentResolver segments;

    public AnnouncementService(AnnouncementRepository announcements,
                               AnnouncementRecipientRepository recipients,
                               SegmentResolver segments) {
        this.announcements = announcements;
        this.recipients = recipients;
        this.segments = segments;
    }

    /**
     * For a real request thread, where the caller IS a user. Never call this from a system context:
     * TenantContext.runAsBox installs a synthetic JWT whose subject is a RANDOM UUID, and
     * announcement.sent_by references users(id), so that id blows up on the foreign key. Background
     * and seed callers use the four-argument form and pass a real user id, or null for "no author".
     */
    @Transactional
    public Announcement send(String body, String segment, UUID segmentRef) {
        return send(body, segment, segmentRef, TenantContext.userId());
    }

    /** @param sentBy a REAL users(id), or null when nobody authored it (system/seed sends). */
    @Transactional
    public Announcement send(String body, String segment, UUID segmentRef, UUID sentBy) {
        Announcement a = new Announcement();
        a.setBody(body.trim());
        a.setSegment(segment);
        a.setSegmentRef(segmentRef);
        a.setSentBy(sentBy);
        a.setSentAt(Instant.now());
        announcements.save(a);

        // Frozen here and never recomputed: a member who renews tomorrow keeps this message.
        List<UUID> audience = segments.resolve(segment, segmentRef);
        for (UUID membershipId : audience) {
            AnnouncementRecipient r = new AnnouncementRecipient();
            r.setAnnouncementId(a.getId());
            r.setMembershipId(membershipId);
            recipients.save(r);
        }
        return a;
    }
}
