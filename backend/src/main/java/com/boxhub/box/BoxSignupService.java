package com.boxhub.box;

import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class BoxSignupService {

    private final AuthService authService;
    private final UserRepository users;
    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final BoxWaitlistRepository waitlist;
    private final PlatformSettings settings;

    public BoxSignupService(AuthService authService, UserRepository users, BoxRepository boxes,
                            MembershipRepository memberships, BoxWaitlistRepository waitlist,
                            PlatformSettings settings) {
        this.authService = authService;
        this.users = users;
        this.boxes = boxes;
        this.memberships = memberships;
        this.waitlist = waitlist;
        this.settings = settings;
    }

    public record SignupOutcome(boolean full) {}

    public boolean acceptingSignups() {
        if ("CLOSED".equals(settings.signupMode())) return false;
        return boxes.countByStatusIn(List.of("ACTIVE", "PENDING")) < settings.maxBoxes();
    }

    /**
     * One submit creates owner + box + BOX_ADMIN membership atomically. The register path is
     * M8's — password policy, HIBP, timing parity, and the taken-email behaviour (same-shaped
     * response, warning mail to the real owner, and here: NO box created) are inherited, not
     * re-implemented. The caller's response is built from the request only.
     */
    @Transactional
    public SignupOutcome signup(String boxName, String name, String email, String password) {
        if (!acceptingSignups()) return new SignupOutcome(true);

        String normalized = email.toLowerCase().trim();
        boolean existed = users.findByEmail(normalized).isPresent();

        User owner = authService.register(normalized, password, name, null);
        if (existed) return new SignupOutcome(false); // warning mail sent by register; no box

        Box box = new Box();
        box.setName(boxName.trim());
        box.setSlug(uniqueSlug(boxName));
        box.setTimezone("Europe/Rome");
        box.setStatus("OPEN".equals(settings.signupMode()) ? "ACTIVE" : "PENDING");
        boxes.save(box);

        // Membership.status defaults to "ACTIVE" via field initializer (verified: Membership.java
        // L19 `private String status = "ACTIVE"`, DB column has no separate default) — new instance
        // already carries it, so box-token mint's "ACTIVE".equals(mem.getStatus()) filter passes
        // without an extra setStatus() call.
        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);

        return new SignupOutcome(false);
    }

    @Transactional
    public void joinWaitlist(String email, String boxName) {
        String normalized = email.toLowerCase().trim();
        if (waitlist.existsByEmail(normalized)) return;
        BoxWaitlist w = new BoxWaitlist();
        w.setEmail(normalized);
        w.setBoxName(boxName.trim());
        try {
            waitlist.saveAndFlush(w);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // concurrent duplicate lost the unique race — idempotent by design
        }
    }

    private String uniqueSlug(String boxName) {
        String base = slugify(boxName);
        if (!boxes.existsBySlug(base)) return base;
        for (int i = 2; ; i++) {
            String candidate = base + "-" + i;
            if (!boxes.existsBySlug(candidate)) return candidate;
        }
    }

    static String slugify(String name) {
        String slug = name.toLowerCase().trim()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        if (slug.length() > 40) slug = slug.substring(0, 40).replaceAll("-$", "");
        return slug.isBlank() ? "box" : slug;
    }
}
