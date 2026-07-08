package com.boxhub.box;

import com.boxhub.identity.RefreshTokenService;
import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class InviteService {

    static final Duration INVITE_TTL = Duration.ofDays(14);

    private final InviteRepository invites;
    private final SecureRandom random = new SecureRandom();

    public InviteService(InviteRepository invites) {
        this.invites = invites;
    }

    public record CreatedInvite(Invite invite, String rawToken) {}

    @Transactional
    public CreatedInvite create(String email, String role, UUID planId) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Invite inv = new Invite();
        inv.setEmail(email.toLowerCase().trim());
        inv.setRole(role);
        inv.setPlanId(planId);
        inv.setTokenHash(RefreshTokenService.sha256(token));
        inv.setExpiresAt(Instant.now().plus(INVITE_TTL));
        inv.setCreatedBy(TenantContext.userId());
        return new CreatedInvite(invites.save(inv), token);
    }

    public record InvitePreview(String boxName, String boxSlug, String role, String email, String planName) {}

    // NOTE: runs tenant-less (public endpoint) — lookup by unguessable token hash.
    @Transactional(readOnly = true)
    public Invite findValid(String rawToken) {
        Invite inv = invites.findByTokenHash(RefreshTokenService.sha256(rawToken))
                .orElseThrow(java.util.NoSuchElementException::new);
        if (inv.getAcceptedAt() != null || inv.getExpiresAt().isBefore(Instant.now()))
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.GONE, "Invite expired or already used");
        return inv;
    }
}
