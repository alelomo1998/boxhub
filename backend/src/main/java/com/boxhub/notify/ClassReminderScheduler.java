package com.boxhub.notify;

import com.boxhub.box.*;
import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Fires CLASS_STARTING_SOON box.class_reminder_minutes before a session starts.
 *
 * <p><b>Nothing renders these rows yet.</b> showsInFeed is false for this type, because an in-app
 * "starts in 1 hour" read at 9pm is noise. The row exists so the sweep is assertable, so dedupe
 * works, and so M27c adds a transport rather than a scheduler (M29b D-11). This is why registry
 * §5.5 now reads "no event without a reader IN THE MILESTONE THAT DELIVERS IT", and why spec §8
 * puts these rows under the same 90-day retention as every other.
 *
 * <p><b>The window is wider than the interval, on purpose.</b> A one-minute sweep matched to a
 * one-minute window loses every reminder in any minute the job does not run — a redeploy, a slow
 * run, a paused container. The window looks back further and leans on the dedupe key (the session
 * id) to make the overlap free: a session already reminded is skipped, so re-covering the same
 * minute costs one indexed existence check and notifies nobody twice.
 *
 * <p><b>Recipients are BOOKED only, never the waitlist.</b> Someone waiting for a spot has no place
 * to turn up to; telling them their class starts in an hour would be a lie. This is the one place
 * M29a's D-7 rule (waitlist included) deliberately does not apply.
 */
@Component
public class ClassReminderScheduler {

    /** How far back the window reaches beyond the sweep interval. See the class comment. */
    static final Duration CATCH_UP = Duration.ofMinutes(5);

    private final BoxRepository boxes;
    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public ClassReminderScheduler(BoxRepository boxes, ClassSessionRepository sessions,
                                  BookingRepository bookings, NotificationService notifications,
                                  PlatformTransactionManager txManager) {
        this.boxes = boxes;
        this.sessions = sessions;
        this.bookings = bookings;
        this.notifications = notifications;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Cron is a property so the test suite can disable it (see application.yml / AbstractIntegrationTest). */
    @Scheduled(cron = "${boxhub.class-reminder-cron}")
    public void sweepAll() {
        Instant now = Instant.now();
        for (Box b : boxes.findAll()) {
            sweepBox(b.getId(), now);
        }
    }

    /** One box. `now` is injected so a test never has to wait for a clock. */
    void sweepBox(UUID boxId, Instant now) {
        TenantContext.runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            Box box = boxes.findById(boxId).orElseThrow();
            Duration lead = Duration.ofMinutes(box.getClassReminderMinutes());
            Instant from = now.plus(lead).minus(CATCH_UP);
            Instant to = now.plus(lead);

            for (ClassSession s : sessions.findByStatusAndStartAtBetween("SCHEDULED", from, to)) {
                // membershipId is null for a visitor drop-in (M22) — no membership to notify, so
                // filter it out rather than let a NOT NULL violation on notification.membership_id
                // take down the rest of the box's sweep.
                List<UUID> booked = bookings.findBySessionId(s.getId()).stream()
                        .filter(b -> "BOOKED".equals(b.getStatus()) || "CHECKED_IN".equals(b.getStatus()))
                        .map(Booking::getMembershipId)
                        .filter(java.util.Objects::nonNull)
                        .distinct()
                        .toList();
                notifications.emitAll(NotificationType.CLASS_STARTING_SOON, booked,
                        Map.of(NotificationType.SESSION_ID, s.getId().toString(),
                               NotificationType.CLASS_NAME, s.getName(),
                               NotificationType.START_AT, s.getStartAt().toString()));
            }
        }));
    }
}
