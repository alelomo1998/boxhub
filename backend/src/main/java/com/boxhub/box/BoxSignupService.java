package com.boxhub.box;

import com.boxhub.identity.AuthService;
import com.boxhub.identity.PasswordPolicy;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class BoxSignupService {

    private final AuthService authService;
    private final UserRepository users;
    private final BoxRepository boxes;
    private final BoxWaitlistRepository waitlist;
    private final PlatformSettings settings;
    private final PasswordPolicy passwordPolicy;
    private final PasswordEncoder passwordEncoder;
    private final BoxSignupTx tx;

    public BoxSignupService(AuthService authService, UserRepository users, BoxRepository boxes,
                            BoxWaitlistRepository waitlist, PlatformSettings settings,
                            PasswordPolicy passwordPolicy, PasswordEncoder passwordEncoder, BoxSignupTx tx) {
        this.authService = authService;
        this.users = users;
        this.boxes = boxes;
        this.waitlist = waitlist;
        this.settings = settings;
        this.passwordPolicy = passwordPolicy;
        this.passwordEncoder = passwordEncoder;
        this.tx = tx;
    }

    public record SignupOutcome(boolean full) {}

    public boolean acceptingSignups() {
        if ("CLOSED".equals(settings.signupMode())) return false;
        return boxes.countByStatusIn(List.of("ACTIVE", "PENDING")) < settings.maxBoxes();
    }

    /**
     * One submit creates owner + box + BOX_ADMIN membership atomically. The register path is
     * M8's — password policy, HIBP, and the taken-email behaviour (same-shaped response, warning
     * mail to the real owner, and here: NO box created) are inherited, not re-implemented. The
     * caller's response is built from the request only.
     *
     * <p>Deliberately NOT {@code @Transactional} — see {@link BoxSignupTx}'s javadoc. The owner
     * insert, box insert, and membership insert all happen inside ONE {@link BoxSignupTx}
     * transaction (atomic: all three rows or none); this method only orchestrates, and its own
     * recovery from a failed attempt runs in fresh transactions on the far side of that proxy
     * call, never inside the one that just rolled back.
     */
    public SignupOutcome signup(String boxName, String name, String email, String password) {
        if (!acceptingSignups()) return new SignupOutcome(true);

        passwordPolicy.check(password);
        String normalized = email.toLowerCase().trim();
        // Paid unconditionally, same as AuthService.register — bcrypt is ~60-100ms of timing
        // parity between a fresh signup and one that's about to recover as taken-email below.
        String hash = passwordEncoder.encode(password);
        String boxStatus = "OPEN".equals(settings.signupMode()) ? "ACTIVE" : "PENDING";

        User owner;
        for (int attempt = 1; ; attempt++) {
            try {
                owner = tx.createOwnerAndBox(boxName.trim(), uniqueSlug(boxName), name, normalized, hash, boxStatus);
                break;
            } catch (DataIntegrityViolationException e) {
                // createOwnerAndBox's transaction already rolled back cleanly (see BoxSignupTx
                // javadoc) — everything from here runs in fresh transactions. Two different unique
                // constraints share that one atomic unit (users.email and boxes.slug), and the
                // exception alone doesn't say which fired, so a definitive re-read does: if the
                // email now resolves, a user already owns it (this attempt lost, or a concurrent
                // one won) — recover as taken-email, no box, same as AuthService.register's race.
                // Otherwise the box slug collided; loop and recompute against the now-committed
                // winner. Bounded: each retry recomputes from committed rows, so a repeat
                // collision needs yet another racer landing the same slug inside the window —
                // after three of those, answer an honest transient 503 instead of an unhandled
                // 500 (and never an unbounded loop on a public endpoint).
                Optional<User> existing = users.findByEmail(normalized);
                if (existing.isPresent()) {
                    authService.notifyTakenEmailAttempt(existing.get());
                    return new SignupOutcome(false);
                }
                if (attempt >= 3)
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "SIGNUP_RETRY");
            }
        }

        authService.sendVerification(owner);
        return new SignupOutcome(false);
    }

    /**
     * Deliberately NOT {@code @Transactional} — see {@link BoxSignupTx}'s javadoc: the insert
     * has to run in its own transaction so a lost race can be caught here, outside it, instead
     * of inside the transaction it just aborted.
     */
    public void joinWaitlist(String email, String boxName) {
        String normalized = email.toLowerCase().trim();
        if (waitlist.existsByEmail(normalized)) return;
        BoxWaitlist w = new BoxWaitlist();
        w.setEmail(normalized);
        w.setBoxName(boxName.trim());
        try {
            tx.insertWaitlistEntry(w);
        } catch (DataIntegrityViolationException e) {
            // concurrent duplicate lost the unique race — idempotent by design. No recovery
            // read needed here (unlike signup/register above), so no fresh transaction either.
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
