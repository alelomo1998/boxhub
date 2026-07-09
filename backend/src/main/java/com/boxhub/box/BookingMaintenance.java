package com.boxhub.box;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Nightly no-show sweep. Runs tenant-less (no security context) → @TenantId is root/fail-open, so the
 * sweep sees every box's past sessions — correct for a global maintenance job. Delegates to
 * BookingService (proxied) so its @Transactional applies.
 */
@Component
public class BookingMaintenance {

    private final BookingService bookingService;

    public BookingMaintenance(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void nightlyNoShowSweep() {
        bookingService.sweepNoShows(Instant.now());
    }
}
