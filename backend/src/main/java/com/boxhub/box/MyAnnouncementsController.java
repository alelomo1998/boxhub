package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** The member's own announcements. Member-scoped throughout (spec §4). */
@RestController
@RequestMapping("/api/box/me/announcements")
public class MyAnnouncementsController {

    private final AnnouncementRecipientRepository recipients;
    private final AnnouncementRepository announcements;
    private final MembershipRepository memberships;
    private final UserRepository users;

    public MyAnnouncementsController(AnnouncementRecipientRepository recipients,
                                     AnnouncementRepository announcements,
                                     MembershipRepository memberships,
                                     UserRepository users) {
        this.recipients = recipients;
        this.announcements = announcements;
        this.memberships = memberships;
        this.users = users;
    }

    /**
     * sentByName is null for a system/seed send (sentBy null, V30's backfill and the 4-arg
     * AnnouncementService.send(..., null)) — never the box name or a placeholder; the frontend
     * supplies its own fallback wording.
     */
    public record MyAnnouncement(UUID id, String body, Instant sentAt, boolean read, String sentByName) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<MyAnnouncement> mine() {
        UUID me = me().getId();
        List<AnnouncementRecipient> rows = recipients.findMineRaw(me);

        // One query for every announcement, not one per row. This endpoint had NO caller until the
        // athlete announcements sheet was built, so its N+1 had never actually run; it would have
        // gone live as thirty round trips for a member with thirty announcements.
        Set<UUID> ids = rows.stream().map(AnnouncementRecipient::getAnnouncementId).collect(Collectors.toSet());
        Map<UUID, Announcement> byId = ids.isEmpty() ? Map.of()
                : announcements.findAllById(ids).stream()
                        .collect(Collectors.toMap(Announcement::getId, a -> a));

        // sender names, resolved once per distinct sender (SessionController#list's pattern) — a
        // member with many announcements from a handful of senders must not cost one query per row.
        Map<UUID, String> senderNames = new HashMap<>();
        for (Announcement a : byId.values()) {
            UUID sentBy = a.getSentBy();
            if (sentBy != null && !senderNames.containsKey(sentBy)) {
                users.findById(sentBy).ifPresent(u -> senderNames.put(sentBy, u.getName()));
            }
        }

        return rows.stream()
                .map(r -> {
                    Announcement a = byId.get(r.getAnnouncementId());
                    if (a == null) return null;
                    String sentByName = a.getSentBy() == null ? null : senderNames.get(a.getSentBy());
                    return new MyAnnouncement(a.getId(), a.getBody(), a.getSentAt(), r.getReadAt() != null, sentByName);
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(MyAnnouncement::sentAt).reversed())
                .toList();
    }

    /**
     * {id} is an ANNOUNCEMENT id, resolved against MY membership. A member passing an announcement
     * they were not sent gets 404 — never someone else's recipient row.
     */
    @PostMapping("/{id}/read")
    @Transactional
    public void read(@PathVariable UUID id) {
        AnnouncementRecipient r = recipients.findByMembershipIdAndAnnouncementId(me().getId(), id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        r.setReadAt(Instant.now());
        recipients.save(r);
    }

    private Membership me() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "Not a member of this box"));
    }
}
