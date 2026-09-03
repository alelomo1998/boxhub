package com.boxhub.box;

import com.boxhub.notify.NotificationService;
import com.boxhub.notify.NotificationType;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Owns every booking state transition. Capacity/waitlist/cutoff/limit decisions are made under
 * a pessimistic lock on the session row (ClassSessionRepository.findWithLockById), which serializes
 * concurrent book() calls for the same session so capacity can never be oversold.
 */
@Service
public class BookingService {

    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final BoxRepository boxes;
    private final PlanRepository plans;
    private final SubscriptionService subscriptions;
    private final EntitlementLedger ledger;
    private final NotificationService notifications;

    public BookingService(ClassSessionRepository sessions, BookingRepository bookings, BoxRepository boxes,
                          PlanRepository plans, SubscriptionService subscriptions, EntitlementLedger ledger,
                          NotificationService notifications) {
        this.sessions = sessions;
        this.bookings = bookings;
        this.boxes = boxes;
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.ledger = ledger;
        this.notifications = notifications;
    }

    @Transactional
    public Booking book(UUID sessionId, UUID membershipId) {
        ClassSession session = sessions.findWithLockById(sessionId).orElseThrow();
        Instant now = Instant.now();
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();

        if ("CANCELLED".equals(session.getStatus())) throw conflict("CANCELLED");
        if (session.getStartAt().isBefore(now)) throw conflict("PAST");
        if (bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, membershipId, "CANCELLED").isPresent())
            throw conflict("ALREADY_BOOKED");
        // ponytail: cutoff gates cancellation only (spec §3) — booking within the cutoff window is
        // allowed (last-minute booking is fine; last-minute self-cancel is not). See cancel() below.
        Subscription active = subscriptions.activeFor(membershipId)
                .orElseThrow(() -> conflict("NO_ACTIVE_SUBSCRIPTION"));
        // ponytail: the reason string stays the bare "LIMIT_REACHED" that book.page.ts:166 switches
        // on. entryLimitViolated() names WHICH of the eight limits bound (spec §2.2) and the tests
        // assert it; it reaches the wire when M14b/M17 rebuilds the athlete booking screen and can
        // render it. Recorded in docs/BACKLOG.md rather than left implicit.
        if (entryLimitViolated(session, box, membershipId, active) != null) throw conflict("LIMIT_REACHED");

        Booking b = new Booking();
        b.setSessionId(sessionId);
        b.setMembershipId(membershipId);
        long bookedCount = bookings.countBySessionIdAndStatus(sessionId, "BOOKED");
        if (bookedCount < session.getCapacity()) {
            b.setStatus("BOOKED");
        } else {
            List<Booking> waitlist = bookings.findBySessionIdAndStatusOrderByPosition(sessionId, "WAITLIST");
            int maxPosition = waitlist.stream().mapToInt(Booking::getPosition).max().orElse(0);
            b.setStatus("WAITLIST");
            b.setPosition(maxPosition + 1);
        }
        Booking saved = bookings.save(b);
        // A WAITLIST join consumes an ENTRY too (user decision 2026-08-22, overriding spec §3.2).
        // Promotion therefore writes NOTHING — the entry was counted at join — which is what makes it
        // impossible for a promotion to push anyone past a limit, and keeps cancel() a pure queue shift.
        ledger.recordEntry(saved.getId(), membershipId, active, session.getStartAt());
        return saved;
    }

    @Transactional
    public void cancel(UUID sessionId, UUID membershipId) {
        ClassSession session = sessions.findWithLockById(sessionId).orElseThrow();
        Booking booking = bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, membershipId, "CANCELLED")
                .orElseThrow();
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();

        boolean wasBooked = "BOOKED".equals(booking.getStatus());

        // was_late is computed and stamped HERE, once, from the cutoff in force right now. cancel_cutoff_min
        // is mutable (M15 puts a UI on it) — deriving lateness at read time instead would let a box
        // loosen its cutoff and retroactively forgive every late cancel in its history.
        Instant now = Instant.now();
        boolean late = session.getStartAt().minus(Duration.ofMinutes(box.getCancelCutoffMin())).isBefore(now);

        // Default (allow_late_cancel = false) is EXACTLY the pre-M16a behaviour: a BOOKED booking
        // simply cannot be cancelled past the cutoff. That default is also why spec §2.4's late-cancel
        // rule was unreachable before M16a — PAST_CUTOFF blocked every late cancel of a BOOKED row, so
        // was_late was only ever true on a waitlist cancel. A box that opts in gets a late cancel that
        // succeeds and, unless late_cancel_refunds_entry, burns the entry as well as the cancellation.
        if (wasBooked && late && !box.isAllowLateCancel()) throw conflict("PAST_CUTOFF");

        // A waitlisted athlete never held a place, so their cancellation is free by default; a box can
        // opt into counting it.
        boolean countsCancellation = wasBooked || box.isCountWaitlistCancellations();

        // A lapsed member must still be able to cancel — entitlement gates book(), never cancel()
        // (M10's other half, pinned by BookingEntitlementTest.lapseDoesNotDisturbExistingBookings...).
        // So no active subscription means no cancellation limit to enforce and no ledger row to write.
        Subscription active = subscriptions.activeFor(membershipId).orElse(null);
        if (active != null && countsCancellation) {
            Plan plan = plans.findById(active.getPlanId()).orElseThrow();
            if (ledger.firstViolated(PlanLimits.CANCELLATION_RULES, plan, active,
                    session.getStartAt(), ZoneId.of(box.getTimezone()), membershipId) != null) {
                throw conflict("CANCEL_LIMIT_REACHED");
            }
        }

        booking.setStatus("CANCELLED");
        booking.setCancelledAt(now);
        booking.setWasLate(late);
        booking.setPosition(null);
        bookings.save(booking);

        // Lateness only bites someone who actually held a place. A waitlisted athlete cancelling
        // "late" gave up nothing, so their entry always comes back.
        boolean refundEntry = !wasBooked || !late || box.isLateCancelRefundsEntry();
        if (active != null) {
            if (refundEntry) ledger.refundEntry(booking.getId());
            if (countsCancellation) {
                ledger.recordCancellation(booking.getId(), membershipId, active, session.getStartAt());
            }
        }

        // Only when the lateness actually cost something. A plain "you cancelled" would be a receipt
        // for an action the member just performed; this is a consequence they may not have noticed.
        if (active != null && wasBooked && late && !refundEntry) {
            notifications.emit(NotificationType.LATE_CANCEL_UNREFUNDED, membershipId,
                    Map.of(NotificationType.SESSION_ID, session.getId().toString(),
                           NotificationType.CLASS_NAME, session.getName(),
                           NotificationType.START_AT, session.getStartAt().toString()));
        }

        if (wasBooked) {
            List<Booking> waitlist = bookings.findBySessionIdAndStatusOrderByPosition(sessionId, "WAITLIST");
            if (!waitlist.isEmpty()) {
                Booking promoted = waitlist.get(0);
                promoted.setStatus("BOOKED");
                promoted.setPosition(null);
                bookings.save(promoted);
                // The gap NOTIFICATIONS.md called the sharpest in the product: before M29b this line
                // gave someone a place in a class and told them nothing. Inside the transaction on
                // purpose — a promotion that rolls back must not leave a "you're in" behind it (M29b D-4).
                notifications.emit(NotificationType.WAITLIST_PROMOTED, promoted.getMembershipId(),
                        Map.of(NotificationType.SESSION_ID, session.getId().toString(),
                               NotificationType.CLASS_NAME, session.getName(),
                               NotificationType.START_AT, session.getStartAt().toString()));
                for (int i = 1; i < waitlist.size(); i++) {
                    Booking wl = waitlist.get(i);
                    wl.setPosition(wl.getPosition() - 1);
                    bookings.save(wl);
                }
                // Deliberately no ledger write: the promoted athlete's ENTRY was recorded when they
                // joined the waitlist. Writing one here would double-count them.
            }
        }
    }

    @Transactional
    public Booking checkIn(UUID bookingId) {
        Booking b = bookings.findById(bookingId).orElseThrow();
        b.setStatus("CHECKED_IN");
        b.setCheckedInAt(Instant.now());
        return bookings.save(b);
    }

    /** Undo a check-in or a mis-fired no-show: CHECKED_IN/NO_SHOW -> BOOKED. */
    @Transactional
    public Booking uncheck(UUID bookingId) {
        Booking b = bookings.findById(bookingId).orElseThrow();
        if ("CHECKED_IN".equals(b.getStatus()) || "NO_SHOW".equals(b.getStatus())) {
            b.setStatus("BOOKED");
            b.setCheckedInAt(null);
        }
        return bookings.save(b);
    }

    @Transactional
    public Booking markNoShow(UUID bookingId) {
        Booking b = bookings.findById(bookingId).orElseThrow();
        boolean alreadyNoShow = "NO_SHOW".equals(b.getStatus());
        b.setStatus("NO_SHOW");
        Booking saved = bookings.save(b);
        // Only on the actual transition. uncheck() sends NO_SHOW back to BOOKED, so mark -> uncheck
        // -> mark is a real coach flow and a double-tap on the roster is a likelier one; neither may
        // stack a second row. NO_SHOW_RECORDED carries no dedupe_key, so this guard is the only
        // defence, and every other M29b emitter guards its transition the same way.
        if (!alreadyNoShow) {
            ClassSession session = sessions.findById(b.getSessionId()).orElseThrow();
            notifications.emit(NotificationType.NO_SHOW_RECORDED, b.getMembershipId(),
                    Map.of(NotificationType.SESSION_ID, session.getId().toString(),
                           NotificationType.CLASS_NAME, session.getName(),
                           NotificationType.START_AT, session.getStartAt().toString()));
        }
        return saved;
    }

    /** Nightly sweep target: flips unmarked BOOKED -> NO_SHOW for sessions that already started. */
    @Transactional
    public int sweepNoShows(Instant before) {
        int flipped = 0;
        for (ClassSession s : sessions.findByStatusAndStartAtBefore("SCHEDULED", before)) {
            for (Booking b : bookings.findBySessionId(s.getId())) {
                if ("BOOKED".equals(b.getStatus())) {
                    b.setStatus("NO_SHOW");
                    bookings.save(b);
                    flipped++;
                }
            }
        }
        return flipped;
    }

    /**
     * M10 T4: booking rights follow the membership's active Subscription, not the dropped
     * Membership.planId. No active subscription -> can't book at all (NO_ACTIVE_SUBSCRIPTION).
     * <p>
     * M16a: all four entry limits, composed with AND — every limit that is SET must pass, with no
     * precedence between periods. Returns the code of the first violated rule (TOTAL, MONTH, WEEK,
     * DAY — for the message, not the logic) or null when every set limit has room. A plan with all
     * eight columns null is what the dropped {@code entitlement = 'UNLIMITED'} used to say.
     * <p>
     * Counts come from entitlement_usage, NOT from bookings: regeneration deletes the CANCELLED rows
     * in its range, so a booking-derived count would let a coach editing the schedule silently alter
     * consumption. See EntitlementUsage's javadoc.
     */
    private String entryLimitViolated(ClassSession session, Box box, UUID membershipId, Subscription active) {
        Plan plan = plans.findById(active.getPlanId()).orElseThrow();
        return ledger.firstViolated(PlanLimits.ENTRY_RULES, plan, active,
                session.getStartAt(), ZoneId.of(box.getTimezone()), membershipId);
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
