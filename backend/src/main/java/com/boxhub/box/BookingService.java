package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
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

    public BookingService(ClassSessionRepository sessions, BookingRepository bookings, BoxRepository boxes,
                          PlanRepository plans, SubscriptionService subscriptions) {
        this.sessions = sessions;
        this.bookings = bookings;
        this.boxes = boxes;
        this.plans = plans;
        this.subscriptions = subscriptions;
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
        if (entitlementBlocked(session, box, membershipId)) throw conflict("LIMIT_REACHED");

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
        return bookings.save(b);
    }

    @Transactional
    public void cancel(UUID sessionId, UUID membershipId) {
        ClassSession session = sessions.findWithLockById(sessionId).orElseThrow();
        Booking booking = bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, membershipId, "CANCELLED")
                .orElseThrow();
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();

        boolean wasBooked = "BOOKED".equals(booking.getStatus());
        if (wasBooked && session.getStartAt().minus(Duration.ofMinutes(box.getCancelCutoffMin())).isBefore(Instant.now())) {
            throw conflict("PAST_CUTOFF");
        }

        // was_late is computed and stamped HERE, once, from the cutoff in force right now. cancel_cutoff_min
        // is mutable (M15 puts a UI on it) — deriving lateness at read time instead would let a box
        // loosen its cutoff and retroactively forgive every late cancel in its history.
        Instant now = Instant.now();
        boolean late = session.getStartAt().minus(Duration.ofMinutes(box.getCancelCutoffMin())).isBefore(now);
        booking.setStatus("CANCELLED");
        booking.setCancelledAt(now);
        booking.setWasLate(late);
        booking.setPosition(null);
        bookings.save(booking);

        if (wasBooked) {
            List<Booking> waitlist = bookings.findBySessionIdAndStatusOrderByPosition(sessionId, "WAITLIST");
            if (!waitlist.isEmpty()) {
                Booking promoted = waitlist.get(0);
                promoted.setStatus("BOOKED");
                promoted.setPosition(null);
                bookings.save(promoted);
                for (int i = 1; i < waitlist.size(); i++) {
                    Booking wl = waitlist.get(i);
                    wl.setPosition(wl.getPosition() - 1);
                    bookings.save(wl);
                }
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
        b.setStatus("NO_SHOW");
        return bookings.save(b);
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
     * No weekly limit set (NULL = unlimited) -> never blocked. Otherwise the existing Mon-Sun
     * box-timezone count vs the plan's entriesPerWeek (logic unchanged from the pre-M16a version).
     * TODO(M16a Task 4): replaced by PlanLimits/EntitlementLedger — the full eight-rule check.
     */
    private boolean entitlementBlocked(ClassSession session, Box box, UUID membershipId) {
        Subscription active = subscriptions.activeFor(membershipId).orElseThrow(() -> conflict("NO_ACTIVE_SUBSCRIPTION"));
        Plan plan = plans.findById(active.getPlanId()).orElseThrow();
        Integer limit = plan.getEntriesPerWeek();
        if (limit == null) return false;

        ZoneId tz = ZoneId.of(box.getTimezone());
        LocalDate monday = session.getStartAt().atZone(tz).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        Instant weekStart = monday.atStartOfDay(tz).toInstant();
        Instant weekEnd = monday.plusWeeks(1).atStartOfDay(tz).toInstant();
        return bookings.countInWeek(membershipId, weekStart, weekEnd) >= limit;
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
