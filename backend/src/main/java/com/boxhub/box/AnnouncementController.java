package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

    public AnnouncementController(AnnouncementService service, AnnouncementRepository announcements,
                                  AnnouncementRecipientRepository recipients) {
        this.service = service;
        this.announcements = announcements;
        this.recipients = recipients;
    }

    public record AnnouncementRow(UUID id, String body, String segment, Instant sentAt,
                                  long sentCount, long readCount) {}
    record SendRequest(@NotBlank @Size(max = 2000) String body, @NotBlank String segment, UUID segmentRef) {}

    /** Coaches may send, not just admins (D-8): a coach cancelling their class needs no admin. */
    @PostMapping
    @Transactional
    public AnnouncementRow send(@Valid @RequestBody SendRequest req) {
        RoleGuard.requireStaff();
        Announcement a = service.send(req.body(), req.segment(), req.segmentRef());
        return row(a);
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
