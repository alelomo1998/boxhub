package com.boxhub.box;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.Brand;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.PlatformSettings;
import com.boxhub.shared.TenantContext;
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
    private final BoxLifecycleTx lifecycleTx;
    private final UserRepository users;
    private final SuperadminAuditRepository audit;

    public SuperadminBoxController(BoxRepository boxes, MembershipRepository memberships,
                                   BoxWaitlistRepository waitlist, PlatformSettings settings,
                                   Mailer mailer, com.boxhub.display.TvStreamService tvStream,
                                   BoxLifecycleTx lifecycleTx, UserRepository users,
                                   SuperadminAuditRepository audit) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.waitlist = waitlist;
        this.settings = settings;
        this.mailer = mailer;
        this.tvStream = tvStream;
        this.lifecycleTx = lifecycleTx;
        this.users = users;
        this.audit = audit;
    }

    record BoxRow(UUID id, String name, String slug, String status, Instant createdAt, String ownerEmail) {}
    record WaitlistRow(String email, String boxName, Instant createdAt) {}
    record SettingsDto(String signupMode, int maxBoxes) {}
    record SettingsPatch(String signupMode, Integer maxBoxes) {}
    record AuditRow(UUID id, String actorEmail, String action, UUID boxId, String detail, Instant createdAt) {}

    @GetMapping("/boxes")
    @Transactional(readOnly = true) // lazy owner User needs the session open (gotcha #4)
    public List<BoxRow> list(@RequestParam(required = false) String status) {
        List<Box> rows = status == null ? boxes.findAllByOrderByCreatedAtDesc()
                                        : boxes.findByStatusOrderByCreatedAtAsc(status);
        return rows.stream().map(b -> new BoxRow(b.getId(), b.getName(), b.getSlug(),
                b.getStatus(), b.getCreatedAt(), ownerEmail(b.getId()))).toList();
    }

    @PostMapping("/boxes/{id}/approve")
    public BoxRow approve(@PathVariable UUID id) {
        BoxLifecycleTx.TransitionResult r = lifecycleTx.approve(id);
        // mail after the transition committed — never from inside the open tx
        if (r.ownerEmail() != null) mailer.send(r.ownerEmail(), "Your box is live on " + Brand.NAME, "box-approved",
                Map.of("boxName", r.box().getName(), "link", mailer.link("/auth/login")));
        return toRow(r);
    }

    @PostMapping("/boxes/{id}/reject")
    public BoxRow reject(@PathVariable UUID id) {
        BoxLifecycleTx.TransitionResult r = lifecycleTx.reject(id);
        if (r.ownerEmail() != null) mailer.send(r.ownerEmail(), "About your " + Brand.NAME + " application", "box-rejected",
                Map.of("boxName", r.box().getName()));
        return toRow(r);
    }

    @PostMapping("/boxes/{id}/suspend")
    public BoxRow suspend(@PathVariable UUID id) {
        BoxLifecycleTx.TransitionResult r = lifecycleTx.suspend(id);
        // after commit — the box's TVs go dark now, not at next reconnect
        tvStream.disconnectBox(id);
        return toRow(r);
    }

    @PostMapping("/boxes/{id}/reactivate")
    public BoxRow reactivate(@PathVariable UUID id) {
        return toRow(lifecycleTx.reactivate(id));
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
    @Transactional // both settings.set() calls AND the audit row commit or roll back together
    public SettingsDto patchSettings(@RequestBody SettingsPatch req) {
        // validate BOTH fields before writing EITHER — a bad payload must not half-apply
        if (req.signupMode() != null && !List.of("OPEN", "APPROVAL", "CLOSED").contains(req.signupMode()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BAD_SIGNUP_MODE");
        if (req.maxBoxes() != null && req.maxBoxes() < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BAD_MAX_BOXES");

        if (req.signupMode() != null) settings.set(PlatformSettings.SIGNUP_MODE, req.signupMode());
        if (req.maxBoxes() != null) settings.set(PlatformSettings.MAX_BOXES, String.valueOf(req.maxBoxes()));

        String actorEmail = users.findById(TenantContext.userId()).map(u -> u.getEmail()).orElse("unknown");
        String detail = "signupMode=" + req.signupMode() + " maxBoxes=" + req.maxBoxes();
        audit.save(new SuperadminAudit(actorEmail, "SETTINGS_CHANGE", null, detail));

        return settings();
    }

    @GetMapping("/audit")
    public List<AuditRow> audit() {
        return audit.findAllByOrderByCreatedAtDesc().stream()
                .map(a -> new AuditRow(a.getId(), a.getActorEmail(), a.getAction(), a.getBoxId(),
                        a.getDetail(), a.getCreatedAt()))
                .toList();
    }

    private BoxRow toRow(BoxLifecycleTx.TransitionResult r) {
        Box b = r.box();
        return new BoxRow(b.getId(), b.getName(), b.getSlug(), b.getStatus(), b.getCreatedAt(), r.ownerEmail());
    }

    // ponytail: Membership.id is a random UUID (no created-at column), so "earliest" BOX_ADMIN
    // isn't derivable by ordering. A box has exactly one BOX_ADMIN at signup time (T2), so any
    // match is correct today; revisit if boxes ever grow multiple admins.
    private String ownerEmail(UUID boxId) {
        return memberships.findFirstByBoxIdAndRole(boxId, "BOX_ADMIN")
                .map(m -> m.getUser().getEmail()).orElse(null);
    }
}
