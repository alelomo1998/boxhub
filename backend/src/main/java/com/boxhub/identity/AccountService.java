package com.boxhub.identity;

import com.boxhub.performance.PerformanceQueries;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.MediaStorage;
import com.boxhub.shared.RoleGuard;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AccountService {

    private static final String DELETED_NAME = "Deleted athlete";
    private static final String DELETED_DOMAIN = "@boxhub.invalid";

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final PasswordPolicy policy;
    private final EmailTokenService emailTokens;
    private final RefreshTokenService refreshTokens;
    private final Mailer mailer;
    private final MembershipRepository memberships;
    private final AuthIdentityRepository identities;
    private final EmailTokenRepository emailTokenRepo;
    private final MediaStorage media;
    private final PerformanceQueries performance;

    public AccountService(UserRepository users, PasswordEncoder encoder, PasswordPolicy policy,
                          EmailTokenService emailTokens, RefreshTokenService refreshTokens, Mailer mailer,
                          MembershipRepository memberships, AuthIdentityRepository identities,
                          EmailTokenRepository emailTokenRepo, MediaStorage media, PerformanceQueries performance) {
        this.users = users;
        this.encoder = encoder;
        this.policy = policy;
        this.emailTokens = emailTokens;
        this.refreshTokens = refreshTokens;
        this.mailer = mailer;
        this.memberships = memberships;
        this.identities = identities;
        this.emailTokenRepo = emailTokenRepo;
        this.media = media;
        this.performance = performance;
    }

    // id is the FAMILY id, not the individual RefreshToken row id: rotation replaces the row on
    // every refresh, but the family persists, and DELETE /api/auth/sessions/{familyId} targets it.
    public record SessionDto(UUID id, String device, String ip, Instant lastSeen, boolean current) {}

    @Transactional
    public User changePassword(UUID userId, String current, String next) {
        User u = users.findById(userId).orElseThrow();
        requirePassword(u, current);
        policy.check(next);
        u.setPasswordHash(encoder.encode(next));
        return users.save(u);
    }

    /**
     * The change lands only when the NEW address confirms it. Anyone can type an address
     * they do not own; only its owner can click the link sent to it.
     */
    @Transactional
    public void startEmailChange(UUID userId, String password, String newEmail) {
        User u = users.findById(userId).orElseThrow();
        requirePassword(u, password);

        String normalized = newEmail.toLowerCase().trim();
        if (users.findByEmail(normalized).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN");

        String token = emailTokens.issue(u, EmailTokenService.EMAIL_CHANGE, normalized,
                EmailTokenService.CHANGE_TTL);
        mailer.send(normalized, "Confirm your new email address", "email-change",
                Map.of("name", u.getName(), "link", mailer.link("/account/email?token=" + token)));
    }

    @Transactional
    public User completeEmailChange(String rawToken) {
        EmailToken t = emailTokens.consume(rawToken, EmailTokenService.EMAIL_CHANGE);
        User u = t.getUser();
        if (users.findByEmail(t.getNewEmail()).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN"); // taken while the link sat in an inbox
        u.setEmail(t.getNewEmail());
        u.setEmailVerified(true);
        try {
            // saveAndFlush so a unique-constraint hit surfaces HERE, inside this try, rather
            // than being deferred to commit (past that point we can no longer catch it) —
            // same precedent as AuthService.register / GoogleLinkService. The pre-check above
            // is just the fast path with a clean error; this is the real backstop for the
            // remaining race (another change to the same address landing between the check
            // and the write).
            return users.saveAndFlush(u);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN");
        }
    }

    /**
     * rawRefreshToken is the caller's own bh_rt cookie value (null for bearer-header callers).
     * Hashing it and comparing to each session's stored hash tells the sessions screen which
     * row is "this device" without ever exposing a token — the hash comparison never needs,
     * and never reveals, the raw value of anyone else's token.
     */
    @Transactional(readOnly = true)
    public List<SessionDto> sessions(UUID userId, String rawRefreshToken) {
        String callerHash = rawRefreshToken == null ? null : RefreshTokenService.sha256(rawRefreshToken);
        return refreshTokens.activeSessions(userId).stream()
                .map(t -> new SessionDto(t.getFamilyId(), DeviceLabel.of(t.getUserAgent()), t.getIp(), t.getLastUsedAt(),
                        callerHash != null && callerHash.equals(t.getTokenHash())))
                .toList();
    }

    /**
     * Right to erasure, without taking a chunk out of the box's history.
     *
     * Every identifying field is destroyed; the membership, scores, bookings and lifts stay.
     * Once the row can no longer identify a person it is outside GDPR entirely — and last
     * year's leaderboard still adds up.
     *
     * This method must NEVER call users.delete() on this row. memberships.user_id cascades
     * ON DELETE (V2__box_core.sql), and bookings/scores/lifts cascade off memberships — so
     * deleting the user would silently drag the box's whole class history down with it. Scrub
     * in place instead.
     *
     * password is optional: null/blank for a passwordless (Google-only) caller, who has
     * nothing to verify and must not be locked out of their own right to erasure — there is
     * no cheap step-up for them short of a full OAuth re-consent redirect, an accepted
     * residual risk. A password-holding caller MUST supply the correct one; this is the only
     * irreversible endpoint in the API and deserves at least as strong a gate as changePassword.
     */
    @Transactional
    public void anonymize(UUID userId, String password) {
        User u = users.findById(userId).orElseThrow();
        if (u.getAnonymizedAt() != null) return; // already gone; idempotent — explicit state, not inferred from the email

        if (u.getPasswordHash() != null) {
            // A wrong password here is a field-validation failure, NOT a dead session — 401 would make
            // it indistinguishable from an expired access token and force the client to guess by URL.
            if (password == null || !encoder.matches(password, u.getPasswordHash()))
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "WRONG_PASSWORD");
        }

        List<Membership> mems = memberships.findByUserIdWithBox(userId);
        mems.stream()
                .filter(m -> "BOX_ADMIN".equals(m.getRole()) && "ACTIVE".equals(m.getStatus()))
                .forEach(m -> RoleGuard.assertNotLastAdmin(memberships, m.getBox().getId()));

        u.setEmail("deleted-" + UUID.randomUUID() + DELETED_DOMAIN);
        u.setName(DELETED_NAME);
        u.setPasswordHash(null);
        u.setEmailVerified(false);
        u.setFailedAttempts(0);
        u.setThrottledUntil(null);
        u.setAnonymizedAt(Instant.now());
        users.save(u);

        identities.deleteByUserId(userId);
        emailTokenRepo.deleteByUserId(userId);
        refreshTokens.revokeAllFor(userId);

        mems.forEach(m -> {
            if (m.getAvatarPath() != null) {
                media.delete(m.getAvatarPath());   // the photo is personal data too
                m.setAvatarPath(null);
                memberships.save(m);
            }
        });
    }

    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID userId) {
        User u = users.findById(userId).orElseThrow();
        List<Membership> mems = memberships.findByUserIdWithBox(userId);
        List<UUID> membershipIds = mems.stream().map(Membership::getId).toList();

        Map<String, Object> user = new HashMap<>();
        user.put("id", u.getId());
        user.put("email", u.getEmail());
        user.put("name", u.getName());

        Map<String, Object> out = new HashMap<>();
        out.put("user", user);
        out.put("memberships", mems.stream()
                .map(m -> Map.of("box", m.getBox().getName(), "role", m.getRole()))
                .toList());
        out.put("bookings", performance.bookingsOf(membershipIds));
        out.put("scores", performance.scoresOf(membershipIds));
        out.put("lifts", performance.liftsOf(membershipIds));
        return out;
    }

    /** A passwordless (Google-only) user must set one via the reset flow before doing either of these. */
    private void requirePassword(User u, String raw) {
        if (u.getPasswordHash() == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "NO_PASSWORD_SET");
        // A wrong password here is a field-validation failure, NOT a dead session — 401 would make
        // it indistinguishable from an expired access token and force the client to guess by URL.
        if (!encoder.matches(raw, u.getPasswordHash()))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "WRONG_PASSWORD");
    }
}
