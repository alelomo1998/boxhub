package com.boxhub.shared;

import com.boxhub.identity.EmailTokenRepository;
import com.boxhub.identity.RefreshTokenRepository;
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
 * window is still needed to catch a replay.
 */
@Component
public class RefreshTokenPurgeJob {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenPurgeJob.class);
    private static final Duration GRACE = Duration.ofDays(30);

    private final RefreshTokenRepository refreshTokens;
    private final EmailTokenRepository emailTokens;

    public RefreshTokenPurgeJob(RefreshTokenRepository refreshTokens, EmailTokenRepository emailTokens) {
        this.refreshTokens = refreshTokens;
        this.emailTokens = emailTokens;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purge() {
        Instant cutoff = Instant.now().minus(GRACE);
        int refresh = refreshTokens.purge(cutoff);
        int email = emailTokens.purge(cutoff);
        log.info("token purge: {} refresh rows, {} email-token rows", refresh, email);
    }
}
