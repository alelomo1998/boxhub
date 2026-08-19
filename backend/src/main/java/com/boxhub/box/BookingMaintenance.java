package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Nightly no-show sweep, across every box. Delegates to BookingService (proxied) so its
 * @Transactional applies.
 */
@Component
public class BookingMaintenance {

    private final BookingService bookingService;

    public BookingMaintenance(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    /**
     * Runs with no security context, so it needs the explicit cross-box opt-in: since M21 a
     * tenant-less read sees NOTHING (docs/TENANCY.md), and without runAsRoot this sweep would find
     * zero sessions and flip nothing, silently, in every box.
     *
     * runAsRoot wraps the CALL, not the body of sweepNoShows — that method is @Transactional, and
     * Hibernate caches the tenant when the session opens, so establishing it inside would be a
     * no-op. The sweep flips status on already-loaded Booking rows and never INSERTs a @TenantId
     * entity (box_id is stamped at insert and never re-stamped on update), which is why root rather
     * than a real box is the right scope here.
     */
    @Scheduled(cron = "0 30 3 * * *")
    public void nightlyNoShowSweep() {
        TenantContext.runAsRoot(() -> bookingService.sweepNoShows(Instant.now()));
    }
}
