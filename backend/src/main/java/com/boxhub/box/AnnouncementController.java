package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

/** One active box-wide message. Staff writes; every member reads. */
@RestController
@RequestMapping("/api/box/announcement")
public class AnnouncementController {

    private final AnnouncementRepository announcements;

    public AnnouncementController(AnnouncementRepository announcements) {
        this.announcements = announcements;
    }

    public record AnnouncementDto(String body, Instant updatedAt) {}
    record PutRequest(@NotBlank String body) {}

    @GetMapping
    public ResponseEntity<AnnouncementDto> get() {
        return announcements.findAll().stream().findFirst()
                .map(a -> ResponseEntity.ok(new AnnouncementDto(a.getBody(), a.getUpdatedAt())))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping
    @Transactional
    public AnnouncementDto put(@Valid @RequestBody PutRequest req) {
        RoleGuard.requireStaff();
        Announcement a = announcements.findAll().stream().findFirst().orElseGet(Announcement::new);
        a.setBody(req.body().trim());
        a.setUpdatedBy(TenantContext.userId());
        a.setUpdatedAt(Instant.now());
        announcements.save(a);
        return new AnnouncementDto(a.getBody(), a.getUpdatedAt());
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<Void> clear() {
        RoleGuard.requireStaff();
        announcements.findAll().stream().findFirst().ifPresent(announcements::delete);
        return ResponseEntity.noContent().build();
    }
}
