package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Staff surface: send an announcement to a segment, and read the history (D-4, D-8). */
@RestController
@RequestMapping("/api/box/announcements")
public class AnnouncementController {

    private final AnnouncementService service;
    private final AnnouncementRepository announcements;
    private final AnnouncementRecipientRepository recipients;
    private final ClassSessionRepository sessions;

    public AnnouncementController(AnnouncementService service, AnnouncementRepository announcements,
                                  AnnouncementRecipientRepository recipients, ClassSessionRepository sessions) {
        this.service = service;
        this.announcements = announcements;
        this.recipients = recipients;
        this.sessions = sessions;
    }

    public record AnnouncementRow(UUID id, String body, String segment, Instant sentAt,
                                  long sentCount, long readCount) {}
    record SendRequest(@NotBlank @Size(max = 2000) String body, @NotBlank String segment, UUID segmentRef) {}

    /** Coaches may send, not just admins (D-8): a coach cancelling their class needs no admin. */
    @PostMapping
    @Transactional
    public AnnouncementRow send(@Valid @RequestBody SendRequest req) {
        RoleGuard.requireStaff();
        assertMaySendToSegment(req.segment(), req.segmentRef());
        Announcement a = service.send(req.body(), req.segment(), req.segmentRef());
        return row(a);
    }

    /**
     * D-8, narrowed (product decision, 2026-08-29): admins remain unrestricted — any segment. A
     * COACH may send only to CLASS_ROSTER, and only for a session they are the assigned coach of —
     * the "cancelling their own 6am" case D-8 was written for, not a gym-wide EVERYONE broadcast or
     * an EXPIRING dunning message. Mirrors MessagingService.assertMayMessage: one named method, not
     * checks scattered across the handler.
     */
    private void assertMaySendToSegment(String segment, UUID segmentRef) {
        if ("BOX_ADMIN".equals(TenantContext.role())) return;

        if (!SegmentResolver.CLASS_ROSTER.equals(segment))
            throw new AccessDeniedException("Coaches may only announce to their own class roster");
        if (segmentRef == null)
            throw new AccessDeniedException("Coaches may only announce to their own class roster");

        // Box-scoped lookup, never a bare findById: a session id from another tenant must not leak
        // whether it exists, and must never be treated as "found".
        ClassSession session = sessions.findById(segmentRef)
                .filter(s -> TenantContext.requireBoxId().equals(s.getBoxId()))
                .orElseThrow(() -> new AccessDeniedException("Class session not found"));

        // Null coachId = unassigned session; no coach may announce to it, only an admin.
        if (session.getCoachId() == null || !session.getCoachId().equals(TenantContext.userId()))
            throw new AccessDeniedException("Coaches may only announce to a class they coach");
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<AnnouncementRow> history() {
        RoleGuard.requireStaff();
        return announcements.findAllByOrderBySentAtDesc().stream().map(this::row).toList();
    }

    private AnnouncementRow row(Announcement a) {
        return new AnnouncementRow(a.getId(), a.getBody(), a.getSegment(), a.getSentAt(),
                recipients.countByAnnouncementId(a.getId()),
                recipients.countByAnnouncementIdAndReadAtIsNotNull(a.getId()));
    }
}
