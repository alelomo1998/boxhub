package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Nightly no-show sweep, across every box. Delegates to BookingService (proxied) so its
 * @Transactional applies.
 *
 * <p><b>Why per-box rather than one platform-wide pass.</b> This job used to run the whole sweep
 * in the cross-box root scope, which was safe only because of a precondition its own comment
 * stated: the sweep flipped status on already-loaded Booking rows and never INSERTed a @TenantId
 * row. Since M29b it emits NO_SHOW_RECORDED, and a notification IS a @TenantId row — under the
 * root sentinel it would take that box_id and be invisible to the member it was written for.
 * Nesting a per-box scope inside the sweep does not rescue it: setting the tenant on an
 * already-open Hibernate session is a no-op. So the job now iterates boxes and installs each
 * box's tenant BEFORE the transaction opens, the shape SubscriptionLapseJob.sweepAll and
 * SessionGenerator.generateAll already use. Box carries no @TenantId, so boxes.findAll() is safe
 * tenant-agnostically.
 */
@Component
public class BookingMaintenance {

    private final BoxRepository boxes;
    private final BookingService bookingService;

    public BookingMaintenance(BoxRepository boxes, BookingService bookingService) {
        this.boxes = boxes;
        this.bookingService = bookingService;
    }

    /**
     * Runs with no security context. Since M21 a tenant-less read sees NOTHING
     * (docs/TENANCY.md), so each box's tenant is installed explicitly before its sweep — without
     * it this job would find zero sessions and flip nothing, silently, in every box.
     *
     * runAsBox wraps the CALL, not the body of sweepNoShows: that method is @Transactional, and
     * Hibernate caches the tenant when the session opens, so establishing it inside would be a
     * no-op.
     */
    @Scheduled(cron = "0 30 3 * * *")
    public void nightlyNoShowSweep() {
        for (Box b : boxes.findAll()) {
            TenantContext.runAsBox(b.getId(), () -> bookingService.sweepNoShows(Instant.now()));
        }
    }
}
