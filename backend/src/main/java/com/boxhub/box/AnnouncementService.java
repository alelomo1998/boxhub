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

    @Transactional
    public Announcement send(String body, String segment, UUID segmentRef) {
        Announcement a = new Announcement();
        a.setBody(body.trim());
        a.setSegment(segment);
        a.setSegmentRef(segmentRef);
        a.setSentBy(TenantContext.userId());
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
