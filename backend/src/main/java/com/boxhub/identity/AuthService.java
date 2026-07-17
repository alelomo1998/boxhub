package com.boxhub.identity;

import com.boxhub.shared.Mailer;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final MembershipRepository memberships;
    private final EmailTokenService emailTokens;
    private final Mailer mailer;
    private final PasswordPolicy passwordPolicy;
    private final LoginThrottleService throttle;
    private final InviteOwnershipProof inviteProof;
    private final String timingEqualizerHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, MembershipRepository memberships,
                       EmailTokenService emailTokens, Mailer mailer, PasswordPolicy passwordPolicy,
                       LoginThrottleService throttle, InviteOwnershipProof inviteProof) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.memberships = memberships;
        this.emailTokens = emailTokens;
        this.mailer = mailer;
        this.passwordPolicy = passwordPolicy;
        this.throttle = throttle;
        this.inviteProof = inviteProof;
        this.timingEqualizerHash = passwordEncoder.encode("timing-equalizer-not-a-real-password");
    }

    /** No invite in play — same as {@link #register(String, String, String, String)} with a null token. */
    @Transactional
    public User register(String email, String rawPassword, String name) {
        return register(email, rawPassword, name, null);
    }

    /**
     * Always succeeds from the caller's point of view — returning 409 on a taken address
     * would turn registration into an account-enumeration oracle. If the address is taken,
     * the REAL owner is told someone tried, and the impostor's input is discarded.
     *
     * {@code inviteToken}: a valid, unexpired invite mailed to THIS SAME address is proof the
     * registrant reads that inbox — the same proof the verification email exists to obtain
     * (see {@link #completeReset}). A missing/foreign/expired/garbage token just means no
     * proof was offered; it never fails registration and never leaks whether it was valid.
     */
    @Transactional
    public User register(String email, String rawPassword, String name, String inviteToken) {
        passwordPolicy.check(rawPassword);
        String normalized = email.toLowerCase().trim();

        // Paid unconditionally, before the existence check: bcrypt is ~60-100ms, so if only
        // the fresh-address branch paid it, response timing alone would out an existing address.
        String hash = passwordEncoder.encode(rawPassword);

        Optional<User> existing = users.findByEmail(normalized);
        if (existing.isPresent()) {
            User owner = existing.get();
            mailer.send(owner.getEmail(), "Someone tried to sign up with your email",
                    "register-attempt", Map.of("name", owner.getName()));
            return owner; // caller builds its response from the request, not this entity
        }

        boolean provenByInvite = inviteToken != null && inviteProof.provesOwnershipOf(inviteToken, normalized);

        User u = new User();
        u.setEmail(normalized);
        u.setPasswordHash(hash);
        u.setName(name);
        u.setEmailVerified(provenByInvite);
        try {
            u = users.saveAndFlush(u);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // lost the race to the unique index — same answer as above, no enumeration
            User owner = users.findByEmail(normalized).orElseThrow();
            mailer.send(owner.getEmail(), "Someone tried to sign up with your email",
                    "register-attempt", Map.of("name", owner.getName()));
            return owner;
        }
        // The not-proven path pays a synchronous EmailTokenService.issue() DB round-trip here that
        // the invite path skips — a theoretical timing differential, unexploitable because taking
        // the fast path requires already holding the 256-bit token (i.e. already knowing the answer).
        if (!provenByInvite) sendVerification(u);
        return u;
    }

    public void sendVerification(User u) {
        String token = emailTokens.issue(u, EmailTokenService.VERIFY, null, EmailTokenService.VERIFY_TTL);
        mailer.send(u.getEmail(), "Verify your email", "verify",
                Map.of("name", u.getName(), "link", mailer.link("/auth/verify?token=" + token)));
    }

    /**
     * Credentials FIRST, verification second. Reversing the order would let anyone learn
     * whether an address is registered by typing it with a junk password.
     */
    @Transactional
    public User login(String email, String rawPassword) {
        String normalized = email.toLowerCase().trim();
        var maybeUser = users.findByEmail(normalized);

        maybeUser.ifPresent(throttle::assertNotThrottled);

        // one bcrypt comparison either way, so unknown-email and wrong-password take equal time
        String hash = maybeUser.map(User::getPasswordHash).orElse(timingEqualizerHash);
        if (hash == null) hash = timingEqualizerHash; // Google-only account: no password to match
        boolean matches = passwordEncoder.matches(rawPassword, hash);

        if (maybeUser.isEmpty() || maybeUser.get().getPasswordHash() == null || !matches) {
            maybeUser.ifPresent(throttle::recordFailure);
            throw new BadCredentialsException("Bad credentials");
        }

        User u = maybeUser.get();
        throttle.recordSuccess(u);
        if (!u.isEmailVerified())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        return u;
    }

    @Transactional(readOnly = true)
    public java.util.List<Membership> membershipsOf(User user) {
        return memberships.findByUserIdWithBox(user.getId());
    }

    /** Silent for unknown addresses — the caller always answers 202 regardless. */
    @Transactional
    public void startReset(String email) {
        users.findByEmail(email.toLowerCase().trim()).ifPresent(u -> {
            String token = emailTokens.issue(u, EmailTokenService.RESET, null, EmailTokenService.RESET_TTL);
            mailer.send(u.getEmail(), "Reset your password", "reset",
                    Map.of("name", u.getName(), "link", mailer.link("/auth/reset?token=" + token)));
        });
    }

    /**
     * Reset is what a compromised user reaches for, so it revokes every session.
     * It also verifies the address: clicking a link in the inbox proves the inbox.
     * This is likewise how a Google-only user acquires a password.
     */
    @Transactional
    public User completeReset(String rawToken, String newPassword) {
        passwordPolicy.check(newPassword);
        EmailToken t = emailTokens.consume(rawToken, EmailTokenService.RESET);
        User u = t.getUser();
        u.setPasswordHash(passwordEncoder.encode(newPassword));
        u.setEmailVerified(true);
        throttle.recordSuccess(u); // clear any backoff — they have proven they own the inbox
        return users.save(u);
    }
}
