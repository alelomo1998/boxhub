package com.boxhub.box;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.PlatformSettings;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
public class SuperadminBoxController {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final BoxWaitlistRepository waitlist;
    private final PlatformSettings settings;
    private final Mailer mailer;
    private final com.boxhub.display.TvStreamService tvStream;

    public SuperadminBoxController(BoxRepository boxes, MembershipRepository memberships,
                                   BoxWaitlistRepository waitlist, PlatformSettings settings,
                                   Mailer mailer, com.boxhub.display.TvStreamService tvStream) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.waitlist = waitlist;
        this.settings = settings;
        this.mailer = mailer;
        this.tvStream = tvStream;
    }

    record BoxRow(UUID id, String name, String slug, String status, Instant createdAt, String ownerEmail) {}
    record WaitlistRow(String email, String boxName, Instant createdAt) {}
    record SettingsDto(String signupMode, int maxBoxes) {}
    record SettingsPatch(String signupMode, Integer maxBoxes) {}

    @GetMapping("/boxes")
    @Transactional(readOnly = true) // lazy owner User needs the session open (gotcha #4)
    public List<BoxRow> list(@RequestParam(required = false) String status) {
        List<Box> rows = status == null ? boxes.findAllByOrderByCreatedAtDesc()
                                        : boxes.findByStatusOrderByCreatedAtAsc(status);
        return rows.stream().map(b -> new BoxRow(b.getId(), b.getName(), b.getSlug(),
                b.getStatus(), b.getCreatedAt(), ownerEmail(b.getId()))).toList();
    }

    @PostMapping("/boxes/{id}/approve")
    @Transactional
    public BoxRow approve(@PathVariable UUID id) {
        Box b = transition(id, "PENDING", "ACTIVE");
        if (boxes.countByStatus("ACTIVE") > settings.maxBoxes()) {
            // count includes the row we just flipped inside this tx — roll back via exception
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CAP_REACHED");
        }
        String owner = ownerEmail(id);
        if (owner != null) mailer.send(owner, "Your box is live on BoxHub", "box-approved",
                Map.of("boxName", b.getName(), "link", mailer.link("/auth/login")));
        return row(b);
    }

    @PostMapping("/boxes/{id}/reject")
    @Transactional
    public BoxRow reject(@PathVariable UUID id) {
        Box b = transition(id, "PENDING", "REJECTED");
        String owner = ownerEmail(id);
        if (owner != null) mailer.send(owner, "About your BoxHub application", "box-rejected",
                Map.of("boxName", b.getName()));
        return row(b);
    }

    @PostMapping("/boxes/{id}/suspend")
    @Transactional
    public BoxRow suspend(@PathVariable UUID id) {
        Box b = transition(id, "ACTIVE", "SUSPENDED");
        tvStream.disconnectBox(id); // the box's TVs go dark now, not at next reconnect
        return row(b);
    }

    @PostMapping("/boxes/{id}/reactivate")
    @Transactional
    public BoxRow reactivate(@PathVariable UUID id) {
        return row(transition(id, "SUSPENDED", "ACTIVE"));
    }

    @GetMapping("/waitlist")
    public List<WaitlistRow> waitlistRows() {
        return waitlist.findAllByOrderByCreatedAtAsc().stream()
                .map(w -> new WaitlistRow(w.getEmail(), w.getBoxName(), w.getCreatedAt())).toList();
    }

    @GetMapping("/settings")
    public SettingsDto settings() {
        return new SettingsDto(settings.signupMode(), settings.maxBoxes());
    }

    @PatchMapping("/settings")
    public SettingsDto patchSettings(@Valid @RequestBody SettingsPatch req) {
        if (req.signupMode() != null) {
            if (!List.of("OPEN", "APPROVAL", "CLOSED").contains(req.signupMode()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BAD_SIGNUP_MODE");
            settings.set(PlatformSettings.SIGNUP_MODE, req.signupMode());
        }
        if (req.maxBoxes() != null) {
            if (req.maxBoxes() < 0)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BAD_MAX_BOXES");
            settings.set(PlatformSettings.MAX_BOXES, String.valueOf(req.maxBoxes()));
        }
        return settings();
    }

    private Box transition(UUID id, String from, String to) {
        Box b = boxes.findById(id).orElseThrow(java.util.NoSuchElementException::new);
        if (!from.equals(b.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "BAD_STATE");
        b.setStatus(to);
        return boxes.save(b);
    }

    private BoxRow row(Box b) {
        return new BoxRow(b.getId(), b.getName(), b.getSlug(), b.getStatus(), b.getCreatedAt(),
                ownerEmail(b.getId()));
    }

    // ponytail: Membership.id is a random UUID (no created-at column), so "earliest" BOX_ADMIN
    // isn't derivable by ordering. A box has exactly one BOX_ADMIN at signup time (T2), so any
    // match is correct today; revisit if boxes ever grow multiple admins.
    private String ownerEmail(UUID boxId) {
        return memberships.findFirstByBoxIdAndRole(boxId, "BOX_ADMIN")
                .map(m -> m.getUser().getEmail()).orElse(null);
    }
}
