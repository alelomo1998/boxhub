package com.boxhub.shared;

import com.boxhub.box.InviteRepository;
import com.boxhub.display.TvDeviceRepository;
import com.boxhub.display.TvPairingService;
import com.boxhub.identity.EmailTokenRepository;
import com.boxhub.identity.RefreshTokenRepository;
import com.boxhub.notify.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Refresh rows are marked consumed rather than deleted (reuse detection needs the
 * evidence), so they accumulate. Keep a grace window: a consumed row younger than the
 * window is still needed to catch a replay. Email tokens and invites share the same
 * 30-day GRACE cutoff. Stale PENDING TV pairing codes use their own much shorter
 * TvPairingService.CODE_TTL window instead (see purge() below) — a PENDING row is
 * already dead the instant CODE_TTL passes (poll/claim both 410 it), so it needs no
 * extra grace.
 */
@Component
public class PurgeJob {

    private static final Logger log = LoggerFactory.getLogger(PurgeJob.class);
    private static final Duration GRACE = Duration.ofDays(30);
    /** A 90-day-old notification is not actionable; see spec §8. Longer than GRACE because these
     *  are the user's own history, not security evidence. */
    private static final Duration NOTIFICATION_RETENTION = Duration.ofDays(90);

    private final RefreshTokenRepository refreshTokens;
    private final EmailTokenRepository emailTokens;
    private final InviteRepository invites;
    private final TvDeviceRepository tvDevices;
    private final NotificationRepository notifications;

    public PurgeJob(RefreshTokenRepository refreshTokens, EmailTokenRepository emailTokens,
                     InviteRepository invites, TvDeviceRepository tvDevices,
                     NotificationRepository notifications) {
        this.refreshTokens = refreshTokens;
        this.emailTokens = emailTokens;
        this.invites = invites;
        this.tvDevices = tvDevices;
        this.notifications = notifications;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purge() {
        Instant cutoff = Instant.now().minus(GRACE);
        int refresh = refreshTokens.purge(cutoff);
        int email = emailTokens.purge(cutoff);
        int invite = invites.purgeAcceptedOrExpired(cutoff);
        Instant codeCutoff = Instant.now().minus(TvPairingService.CODE_TTL);
        int tv = tvDevices.deleteByStatusAndCreatedAtBefore("PENDING", codeCutoff);
        // Native and tenant-agnostic on purpose: this job holds no tenant, and a derived delete
        // would filter to the NO_TENANT sentinel and remove nothing at all.
        int notifs = notifications.purge(Instant.now().minus(NOTIFICATION_RETENTION));
        log.info("purge: {} refresh rows, {} email-token rows, {} invites, {} stale tv pairing codes, {} notifications",
                refresh, email, invite, tv, notifs);
    }
}
