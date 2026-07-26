package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.Invite;
import com.boxhub.box.InviteRepository;
import com.boxhub.display.TvDevice;
import com.boxhub.display.TvDeviceRepository;
import com.boxhub.display.TvPairingService;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.EmailToken;
import com.boxhub.identity.EmailTokenRepository;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.RefreshToken;
import com.boxhub.identity.RefreshTokenRepository;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * First coverage for PurgeJob (renamed from RefreshTokenPurgeJob), which now sweeps all four
 * expiring row types: refresh tokens, email tokens, invites, and stale PENDING TV pairing codes.
 * Every case is seeded across TWO boxes and the job is run tenant-less (SecurityContextHolder
 * cleared), same as the real @Scheduled entry point — see docs/TENANCY.md and
 * SubscriptionLapseTest#sweepAllFlipsDueSubscriptionsInEveryBoxNotJustOne for why: a single-box
 * test passes happily against a silently-broken cross-box sweep.
 */
class PurgeJobTest extends AbstractIntegrationTest {

    @Autowired PurgeJob purgeJob;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;
    @Autowired RefreshTokenRepository refreshTokens;
    @Autowired EmailTokenRepository emailTokens;
    @Autowired InviteRepository invites;
    @Autowired TvDeviceRepository tvDevices;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newBox(String slug) {
        Box b = new Box();
        b.setName("Purge " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private User newUser(UUID boxId, String emailPrefix) {
        long n = System.nanoTime();
        String email = emailPrefix + "-" + n + "-" + Math.random() + "@t.io";
        User u = authService.register(email, "correct-horse-battery", "Purge Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        memberships.save(m);
        return u;
    }

    private RefreshToken newRefreshToken(User user, Instant expiresAt, Instant consumedAt) {
        RefreshToken t = new RefreshToken();
        t.setUser(user);
        t.setTokenHash(UUID.randomUUID().toString());
        t.setExpiresAt(expiresAt);
        t.setFamilyId(UUID.randomUUID());
        t.setConsumedAt(consumedAt);
        return refreshTokens.save(t);
    }

    private EmailToken newEmailToken(User user, Instant expiresAt, Instant consumedAt) {
        EmailToken t = new EmailToken();
        t.setUser(user);
        t.setType("RESET");
        t.setTokenHash(UUID.randomUUID().toString());
        t.setExpiresAt(expiresAt);
        t.setConsumedAt(consumedAt);
        return emailTokens.save(t);
    }

    private Invite newInvite(UUID createdBy, Instant expiresAt, Instant acceptedAt) {
        Invite inv = new Invite();
        inv.setEmail("invitee-" + System.nanoTime() + "@t.io");
        inv.setRole("ATHLETE");
        inv.setTokenHash(UUID.randomUUID().toString());
        inv.setExpiresAt(expiresAt);
        inv.setAcceptedAt(acceptedAt);
        inv.setCreatedBy(createdBy);
        return invites.save(inv);
    }

    private TvDevice newPendingDevice(Instant createdAt) {
        TvDevice d = new TvDevice();
        d.setPairingCode(String.format("%06d", (int) (Math.random() * 1_000_000)));
        d.setSecretHash(UUID.randomUUID().toString());
        d.setStatus("PENDING");
        setCreatedAt(d, createdAt);
        return tvDevices.save(d);
    }

    private TvDevice newActiveDevice(UUID boxId, Instant createdAt) {
        TvDevice d = new TvDevice();
        d.setPairingCode(String.format("%06d", (int) (Math.random() * 1_000_000)));
        d.setSecretHash(UUID.randomUUID().toString());
        d.setStatus("ACTIVE");
        d.setBoxId(boxId);
        setCreatedAt(d, createdAt);
        return tvDevices.save(d);
    }

    /** TvDevice.createdAt has no setter (defaults to Instant.now() at construction); use reflection
     *  to backdate it for the "stale" fixtures instead of adding a production setter no caller needs. */
    private void setCreatedAt(TvDevice d, Instant createdAt) {
        try {
            var f = TvDevice.class.getDeclaredField("createdAt");
            f.setAccessible(true);
            f.set(d, createdAt);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void refreshTokensPastGraceArePurgedAcrossBothBoxesAndFreshTokensSurvive() {
        UUID boxA = newBox("purge-rt-a-" + System.nanoTime());
        User userA = newUser(boxA, "rt-a");
        UUID boxB = newBox("purge-rt-b-" + System.nanoTime());
        User userB = newUser(boxB, "rt-b");

        Instant now = Instant.now();
        UUID doomedA = newRefreshToken(userA, now.plusSeconds(3600), now.minus(Duration.ofDays(31))).getId();
        UUID survivorA = newRefreshToken(userA, now.plusSeconds(3600), null).getId();
        UUID doomedB = newRefreshToken(userB, now.plusSeconds(3600), now.minus(Duration.ofDays(31))).getId();
        UUID survivorB = newRefreshToken(userB, now.plusSeconds(3600), null).getId();

        SecurityContextHolder.clearContext(); // the @Scheduled entry point runs tenant-less
        purgeJob.purge();

        assertThat(refreshTokens.findById(doomedA)).isEmpty();
        assertThat(refreshTokens.findById(doomedB)).isEmpty();
        assertThat(refreshTokens.findById(survivorA)).isPresent();
        assertThat(refreshTokens.findById(survivorB)).isPresent();
    }

    @Test
    void emailTokensPastGraceArePurgedAcrossBothBoxesAndFreshTokensSurvive() {
        UUID boxA = newBox("purge-et-a-" + System.nanoTime());
        User userA = newUser(boxA, "et-a");
        UUID boxB = newBox("purge-et-b-" + System.nanoTime());
        User userB = newUser(boxB, "et-b");

        Instant now = Instant.now();
        // doomed: already consumed (purge() deletes any consumed row, no grace) — see EmailTokenRepository#purge
        UUID doomedA = newEmailToken(userA, now.plusSeconds(3600), now).getId();
        UUID survivorA = newEmailToken(userA, now.plusSeconds(3600), null).getId();
        UUID doomedB = newEmailToken(userB, now.plusSeconds(3600), now).getId();
        UUID survivorB = newEmailToken(userB, now.plusSeconds(3600), null).getId();

        SecurityContextHolder.clearContext();
        purgeJob.purge();

        assertThat(emailTokens.findById(doomedA)).isEmpty();
        assertThat(emailTokens.findById(doomedB)).isEmpty();
        assertThat(emailTokens.findById(survivorA)).isPresent();
        assertThat(emailTokens.findById(survivorB)).isPresent();
    }

    @Test
    void invitesAcceptedOrExpiredArePurgedAcrossBothBoxesAndPendingInvitesSurvive() {
        UUID boxA = newBox("purge-inv-a-" + System.nanoTime());
        actAsBox(boxA);
        User adminA = newUser(boxA, "inv-admin-a");
        Instant now = Instant.now();
        UUID expiredA = newInvite(adminA.getId(), now.minus(Duration.ofDays(31)), null).getId();
        UUID pendingA = newInvite(adminA.getId(), now.plusSeconds(3600), null).getId();

        UUID boxB = newBox("purge-inv-b-" + System.nanoTime());
        actAsBox(boxB);
        User adminB = newUser(boxB, "inv-admin-b");
        UUID acceptedB = newInvite(adminB.getId(), now.plusSeconds(3600), now.minus(Duration.ofDays(31))).getId();
        UUID pendingB = newInvite(adminB.getId(), now.plusSeconds(3600), null).getId();
        // Accepted, but WITHIN grace: the admin invites list still wants it as context. Pins the
        // age check on the accepted branch — drop `and accepted_at < :cutoff` from the query and
        // this row disappears while every other assertion here keeps passing.
        UUID recentlyAcceptedB = newInvite(adminB.getId(), now.plusSeconds(3600), now).getId();

        SecurityContextHolder.clearContext(); // real scheduler entry point: no ambient tenant at all
        purgeJob.purge();

        actAsBox(boxA);
        assertThat(invites.findById(expiredA)).isEmpty();
        assertThat(invites.findById(pendingA)).isPresent();

        actAsBox(boxB);
        assertThat(invites.findById(acceptedB)).isEmpty();
        assertThat(invites.findById(pendingB)).isPresent();
        assertThat(invites.findById(recentlyAcceptedB)).isPresent();
    }

    /**
     * Regression guard for the native-vs-JPQL distinction on InviteRepository#purgeAcceptedOrExpired.
     * The tenant-LESS scenario above (SecurityContextHolder cleared) fails open on Hibernate's
     * NO_TENANT/root and happens to sweep every box regardless of native vs JPQL — it does not
     * discriminate. This test leaves ONE box's ambient tenant set (the same actAsBox path a real
     * request would carry) before calling purge(), which is docs/TENANCY.md's "failure mode 1":
     * a JPQL/derived bulk delete would silently purge only that one box. This test FAILS if
     * purgeAcceptedOrExpired is ever changed from native to JPQL/derived.
     */
    @Test
    void invitePurgeSweepsBothBoxesEvenUnderOneBoxsAmbientTenant() {
        UUID boxA = newBox("purge-inv-tenant-a-" + System.nanoTime());
        actAsBox(boxA);
        User adminA = newUser(boxA, "inv-tenant-admin-a");
        Instant now = Instant.now();
        UUID expiredA = newInvite(adminA.getId(), now.minus(Duration.ofDays(31)), null).getId();

        UUID boxB = newBox("purge-inv-tenant-b-" + System.nanoTime());
        actAsBox(boxB);
        User adminB = newUser(boxB, "inv-tenant-admin-b");
        UUID acceptedB = newInvite(adminB.getId(), now.plusSeconds(3600), now.minus(Duration.ofDays(31))).getId();

        actAsBox(boxA); // ambient tenant = ONE specific box, left set — not cleared
        purgeJob.purge();

        actAsBox(boxA);
        assertThat(invites.findById(expiredA)).isEmpty();
        actAsBox(boxB);
        assertThat(invites.findById(acceptedB)).isEmpty();
    }

    @Test
    void stalePendingTvPairingCodesArePurgedAcrossBothBoxesAndActiveDevicesNeverAreEvenIfOld() {
        UUID boxA = newBox("purge-tv-a-" + System.nanoTime());
        UUID boxB = newBox("purge-tv-b-" + System.nanoTime());

        Instant now = Instant.now();
        Instant staleCreatedAt = now.minus(TvPairingService.CODE_TTL).minusSeconds(1);
        Instant freshCreatedAt = now;

        UUID stalePendingA = newPendingDevice(staleCreatedAt).getId();
        UUID freshPendingA = newPendingDevice(freshCreatedAt).getId();
        UUID activeOldA = newActiveDevice(boxA, staleCreatedAt).getId(); // old but ACTIVE: must survive

        UUID stalePendingB = newPendingDevice(staleCreatedAt).getId();
        UUID freshPendingB = newPendingDevice(freshCreatedAt).getId();
        UUID activeOldB = newActiveDevice(boxB, staleCreatedAt).getId(); // old but ACTIVE: must survive

        SecurityContextHolder.clearContext();
        purgeJob.purge();

        assertThat(tvDevices.findById(stalePendingA)).isEmpty();
        assertThat(tvDevices.findById(stalePendingB)).isEmpty();
        assertThat(tvDevices.findById(freshPendingA)).isPresent();
        assertThat(tvDevices.findById(freshPendingB)).isPresent();
        assertThat(tvDevices.findById(activeOldA)).isPresent();
        assertThat(tvDevices.findById(activeOldB)).isPresent();
    }
}
