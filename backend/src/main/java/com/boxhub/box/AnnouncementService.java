package com.boxhub.box;

import com.boxhub.identity.UserRepository;
import com.boxhub.notify.NotificationService;
import com.boxhub.notify.NotificationType;
import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Sending = resolve the audience, then freeze it as rows. One transaction (D-2). */
@Service
public class AnnouncementService {

    private final AnnouncementRepository announcements;
    private final AnnouncementRecipientRepository recipients;
    private final SegmentResolver segments;
    private final NotificationService notifications;
    private final UserRepository users;

    public AnnouncementService(AnnouncementRepository announcements,
                               AnnouncementRecipientRepository recipients,
                               SegmentResolver segments,
                               NotificationService notifications,
                               UserRepository users) {
        this.announcements = announcements;
        this.recipients = recipients;
        this.segments = segments;
        this.notifications = notifications;
        this.users = users;
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

        // The feed fan-out is a read of the audience we just froze, not a second resolution
        // (M29a D-2). Same transaction as the recipient rows: an announcement that rolls back must
        // not leave notifications behind claiming it was sent.
        //
        // These rows carry NO read state. announcement_recipient.read_at above is the ONE marker,
        // and the feed derives its flag from it — two of them would disagree the first time
        // somebody read an announcement from the feed instead of the home card (M29b D-3).
        if (!audience.isEmpty()) {
            Map<String, Object> params = new HashMap<>();
            params.put(NotificationType.ANNOUNCEMENT_ID, a.getId().toString());
            params.put(NotificationType.BODY_PREVIEW, preview(a.getBody()));
            // A null sender is legitimate (V30's backfill, seed sends). The key is OMITTED rather
            // than set to a placeholder: "Your gym" is a translatable string the frontend owns, and
            // baking it in here would ship it in one language forever.
            if (sentBy != null) {
                users.findById(sentBy).ifPresent(u -> params.put(NotificationType.SENT_BY_NAME, u.getName()));
            }
            notifications.emitAll(NotificationType.NEW_ANNOUNCEMENT, audience, params);
        }
        return a;
    }

    /** Announcement bodies are user-written and unbounded; a feed row shows the opening of one. */
    private static String preview(String body) {
        return body.length() <= NotificationType.BODY_PREVIEW_CHARS
                ? body
                : body.substring(0, NotificationType.BODY_PREVIEW_CHARS);
    }
}
