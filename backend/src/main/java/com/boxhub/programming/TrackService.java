package com.boxhub.programming;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class TrackService {

    private final TrackRepository tracks;
    private final TransactionTemplate tx;

    public TrackService(TrackRepository tracks, PlatformTransactionManager txManager) {
        this.tracks = tracks;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Seed RX + Fitness for a freshly created box. Called from the box-create path, where the
     * caller is superadmin (no box tenant). Track is @TenantId, so we set a synthetic box tenant
     * BEFORE the tx opens (gotcha #2) — same pattern as SessionGenerator.runAsBox.
     */
    public void seedDefaults(UUID boxId) {
        runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            if (!tracks.findByArchivedFalseOrderBySortOrderAsc().isEmpty()) return; // idempotent
            seed("RX", 0);
            seed("Fitness", 1);
        }));
    }

    private void seed(String name, int order) {
        Track t = new Track();
        t.setName(name);
        t.setSortOrder(order);
        tracks.save(t);
    }

    private void runAsBox(UUID boxId, Runnable r) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("system").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
            r.run();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }
}
