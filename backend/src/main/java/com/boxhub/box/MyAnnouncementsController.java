package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** The member's own announcements. Member-scoped throughout (spec §4). */
@RestController
@RequestMapping("/api/box/me/announcements")
public class MyAnnouncementsController {

    private final AnnouncementRecipientRepository recipients;
    private final AnnouncementRepository announcements;
    private final MembershipRepository memberships;

    public MyAnnouncementsController(AnnouncementRecipientRepository recipients,
                                     AnnouncementRepository announcements,
                                     MembershipRepository memberships) {
        this.recipients = recipients;
        this.announcements = announcements;
        this.memberships = memberships;
    }

    public record MyAnnouncement(UUID id, String body, Instant sentAt, boolean read) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<MyAnnouncement> mine() {
        UUID me = me().getId();
        return recipients.findMineRaw(me).stream()
                .map(r -> announcements.findById(r.getAnnouncementId())
                        .map(a -> new MyAnnouncement(a.getId(), a.getBody(), a.getSentAt(), r.getReadAt() != null))
                        .orElse(null))
                .filter(java.util.Objects::nonNull)
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
