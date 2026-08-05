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
    private final RegisterTx registerTx;
    private final String timingEqualizerHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, MembershipRepository memberships,
                       EmailTokenService emailTokens, Mailer mailer, PasswordPolicy passwordPolicy,
                       LoginThrottleService throttle, InviteOwnershipProof inviteProof, RegisterTx registerTx) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.memberships = memberships;
        this.emailTokens = emailTokens;
        this.mailer = mailer;
        this.passwordPolicy = passwordPolicy;
        this.throttle = throttle;
        this.inviteProof = inviteProof;
        this.registerTx = registerTx;
        this.timingEqualizerHash = passwordEncoder.encode("timing-equalizer-not-a-real-password");
    }

    /** No invite in play — same as {@link #register(String, String, String, String)} with a null token. */
    public User register(String email, String rawPassword, String name) {
        return register(email, rawPassword, name, null);
    }

    /** No Accept-Language available to this caller — same as
     *  {@link #register(String, String, String, String, String)} with a null locale, which falls
     *  back to "en" (or the invite's box locale, when the token proves ownership). */
    public User register(String email, String rawPassword, String name, String inviteToken) {
        return register(email, rawPassword, name, inviteToken, null);
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
     *
     * {@code acceptLanguageLocale}: the caller's {@code Accept-Language}, already reduced to a
     * bare language tag (or null/blank). Seeds {@code users.locale} — UNLESS the invite proves
     * ownership, in which case the invited member inherits the invite's box's locale instead
     * (M13a T8, spec §3 "Decided — where locale lives": a box sets its language once). Either way,
     * a missing value falls back to "en".
     *
     * <p>Deliberately NOT {@code @Transactional} — see {@link RegisterTx}'s javadoc. The
     * concurrent-duplicate recovery below re-fetches the winner's row in a transaction separate
     * from the failed insert, which only happens if this method has no ambient transaction of
     * its own for {@code registerTx.insertUser}'s proxy call to join.
     */
    public User register(String email, String rawPassword, String name, String inviteToken,
                         String acceptLanguageLocale) {
        passwordPolicy.check(rawPassword);
        String normalized = email.toLowerCase().trim();

        // Paid unconditionally, before the existence check: bcrypt is ~60-100ms, so if only
        // the fresh-address branch paid it, response timing alone would out an existing address.
        String hash = passwordEncoder.encode(rawPassword);

        Optional<User> existing = users.findByEmail(normalized);
        if (existing.isPresent()) {
            User owner = existing.get();
            notifyTakenEmailAttempt(owner);
            return owner; // caller builds its response from the request, not this entity
        }

        boolean provenByInvite = inviteToken != null && inviteProof.provesOwnershipOf(inviteToken, normalized);
        String locale = provenByInvite
                ? inviteProof.boxLocaleForToken(inviteToken).orElse(acceptLanguageLocale)
                : acceptLanguageLocale;

        User u;
        try {
            u = registerTx.insertUser(normalized, hash, name, provenByInvite, locale);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Lost the race to the unique index — same answer as above, no enumeration. Recovers
            // in a FRESH transaction (see RegisterTx javadoc): insertUser's own transaction
            // already rolled back cleanly, so this re-read can't run inside it.
            User owner = registerTx.recoverExistingOwner(normalized);
            notifyTakenEmailAttempt(owner);
            return owner;
        }
        // The not-proven path pays a synchronous EmailTokenService.issue() DB round-trip here that
        // the invite path skips — a theoretical timing differential, unexploitable because taking
        // the fast path requires already holding the 256-bit token (i.e. already knowing the answer).
        if (!provenByInvite) sendVerification(u);
        return u;
    }

    /**
     * Anti-enumeration: the REAL owner is told someone tried their address, never the caller.
     * Public so {@code BoxSignupService} can reuse the exact same notice on its own taken-email
     * recovery path (its atomic insert shares this same unique constraint — see
     * {@code BoxSignupTx}'s javadoc) instead of re-deriving the copy.
     */
    public void notifyTakenEmailAttempt(User owner) {
        mailer.send(owner.getEmail(), "Someone tried to sign up with your email",
                "register-attempt", Map.of("name", owner.getName()));
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
