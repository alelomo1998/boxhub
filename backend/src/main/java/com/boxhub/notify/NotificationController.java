package com.boxhub.notify;

import com.boxhub.box.AnnouncementRecipient;
import com.boxhub.box.AnnouncementRecipientRepository;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/** The member's own feed. Member-scoped throughout: no id from a request ever selects a person. */
@RestController
@RequestMapping("/api/box/notifications")
public class NotificationController {

    private static final int PAGE_SIZE = 30;

    private final NotificationRepository notifications;
    private final AnnouncementRecipientRepository recipients;
    private final MembershipRepository memberships;

    public NotificationController(NotificationRepository notifications,
                                  AnnouncementRecipientRepository recipients,
                                  MembershipRepository memberships) {
        this.notifications = notifications;
        this.recipients = recipients;
        this.memberships = memberships;
    }

    public record FeedRow(UUID id, String type, Map<String, Object> params, String link,
                          Instant createdAt, boolean read) {}
    /** nextCursor is null on the last page — the frontend stops when it is. */
    public record FeedPage(List<FeedRow> rows, String nextCursor) {}
    public record UnreadCount(long count) {}

    /**
     * One page, newest first. `cursor` is optional and MUST stay optional: a required @RequestParam
     * makes Spring 400 the request before RoleGuard runs, so the authz sweep would never exercise
     * the role check on this route (AuthzConformanceTest's own documented trap).
     */
    @GetMapping
    @Transactional(readOnly = true)
    public FeedPage list(@RequestParam(required = false) String cursor) {
        UUID me = me().getId();
        List<String> types = NotificationType.feedTypeNames();

        // One extra row is the "is there a next page?" probe — cheaper and more honest than a
        // count query, which would race an emit between the two statements.
        var page = PageRequest.of(0, PAGE_SIZE + 1);
        List<Notification> rows = cursor == null
                ? notifications.firstPage(me, types, page)
                : decode(cursor).map(c -> notifications.pageAfter(me, types, c.createdAt(), c.id(), page))
                                .orElseGet(() -> notifications.firstPage(me, types, page));

        boolean hasMore = rows.size() > PAGE_SIZE;
        if (hasMore) rows = rows.subList(0, PAGE_SIZE);

        Set<UUID> readAnnouncements = readAnnouncementIds(me, rows);

        List<FeedRow> out = rows.stream().map(n -> new FeedRow(
                n.getId(), n.getType(), n.getParams(), n.getLink(), n.getCreatedAt(),
                isRead(n, readAnnouncements))).toList();

        String next = hasMore && !rows.isEmpty()
                ? encode(rows.getLast().getCreatedAt(), rows.getLast().getId())
                : null;
        return new FeedPage(out, next);
    }

    /**
     * The bell's badge. Deliberately a sum of two counts rather than a join: announcements are
     * counted from announcement_recipient, which is the ONE read marker for them (D-3), and that
     * is the same number HomeController already computes for the home card's badge.
     */
    @GetMapping("/unread-count")
    @Transactional(readOnly = true)
    public UnreadCount unreadCount() {
        UUID me = me().getId();
        List<String> owned = NotificationType.feedTypeNames().stream()
                .filter(t -> !NotificationType.NEW_ANNOUNCEMENT.name().equals(t)).toList();
        return new UnreadCount(notifications.countUnread(me, owned)
                + recipients.countByMembershipIdAndReadAtIsNull(me));
    }

    /**
     * {id} is a NOTIFICATION id resolved against MY membership — a member passing someone else's
     * gets 404, never that row.
     */
    @PostMapping("/{id}/read")
    @Transactional
    public void read(@PathVariable UUID id) {
        UUID me = me().getId();
        Notification n = notifications.findByIdAndMembershipId(id, me)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        markRead(me, n);
    }

    @PostMapping("/read-all")
    @Transactional
    public void readAll() {
        UUID me = me().getId();
        for (Notification n : notifications.findByMembershipIdAndTypeInAndReadAtIsNull(
                me, NotificationType.feedTypeNames())) {
            markRead(me, n);
        }
        // Announcements are not in the loop above — their unread state is not on the notification
        // row at all. Marking them here is what makes "Mark all read" clear the bell completely.
        for (AnnouncementRecipient r : recipients.findMineRaw(me)) {
            if (r.getReadAt() == null) {
                r.setReadAt(Instant.now());
                recipients.save(r);
            }
        }
    }

    /**
     * The delegation, in one place. An announcement's read state lives in announcement_recipient
     * and NOWHERE else: writing notification.read_at here would create the second marker this
     * milestone exists to avoid, and the two would disagree the first time somebody read an
     * announcement from the home card instead of the feed.
     */
    private void markRead(UUID membershipId, Notification n) {
        if (NotificationType.NEW_ANNOUNCEMENT.name().equals(n.getType())) {
            if (n.getSourceId() != null) {
                recipients.findByMembershipIdAndAnnouncementId(membershipId, n.getSourceId())
                        .ifPresent(r -> {
                            r.setReadAt(Instant.now());
                            recipients.save(r);
                        });
            }
            return;   // notification.read_at stays null forever for this type
        }
        n.setReadAt(Instant.now());
        notifications.save(n);
    }

    private boolean isRead(Notification n, Set<UUID> readAnnouncements) {
        return NotificationType.NEW_ANNOUNCEMENT.name().equals(n.getType())
                ? readAnnouncements.contains(n.getSourceId())
                : n.getReadAt() != null;
    }

    /** ONE query for every announcement row on the page. Never one lookup per row. */
    private Set<UUID> readAnnouncementIds(UUID membershipId, List<Notification> rows) {
        Set<UUID> ids = rows.stream()
                .filter(n -> NotificationType.NEW_ANNOUNCEMENT.name().equals(n.getType()))
                .map(Notification::getSourceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) return Set.of();
        return recipients.findByMembershipIdAndAnnouncementIdIn(membershipId, ids).stream()
                .filter(r -> r.getReadAt() != null)
                .map(AnnouncementRecipient::getAnnouncementId)
                .collect(Collectors.toSet());
    }

    private record Cursor(Instant createdAt, UUID id) {}

    private static String encode(Instant createdAt, UUID id) { return createdAt + "_" + id; }

    /** A malformed cursor falls back to page one rather than 500ing — it is a client-supplied
     *  opaque string, and a stale one is a normal thing to receive. */
    private static Optional<Cursor> decode(String cursor) {
        int split = cursor.lastIndexOf('_');
        if (split <= 0) return Optional.empty();
        try {
            return Optional.of(new Cursor(Instant.parse(cursor.substring(0, split)),
                                          UUID.fromString(cursor.substring(split + 1))));
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }

    private Membership me() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }
}
