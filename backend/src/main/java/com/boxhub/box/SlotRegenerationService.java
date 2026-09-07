package com.boxhub.box;

import com.boxhub.display.ClassTimerRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.*;
import java.util.List;
import java.util.UUID;

/**
 * Regenerates a slot's sessions from a date forward. It REFUSES a range that holds a live booking
 * rather than cancelling or moving anyone (spec decision 11): both destructive options send mail, and
 * an admin adjusting a schedule must not be able to mail forty people by accident.
 *
 * A CANCELLED booking is history, not a claim on a place, and does NOT block — otherwise accumulated
 * cancels would freeze a slot permanently. BOOKED, WAITLIST and CHECKED_IN are live claims; NO_SHOW is
 * attendance history that regeneration would destroy. All four block.
 */
@Service
public class SlotRegenerationService {

    private static final List<String> BLOCKING = List.of("BOOKED", "WAITLIST", "CHECKED_IN", "NO_SHOW");

    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final ClassTimerRepository timers;
    private final BoxRepository boxes;
    private final SessionGenerator generator;

    public SlotRegenerationService(ScheduleSlotRepository slots, ClassTypeRepository types,
                                   ClassSessionRepository sessions, BookingRepository bookings,
                                   ClassTimerRepository timers, BoxRepository boxes, SessionGenerator generator) {
        this.slots = slots;
        this.types = types;
        this.sessions = sessions;
        this.bookings = bookings;
        this.timers = timers;
        this.boxes = boxes;
        this.generator = generator;
    }

    @Transactional
    public void regenerateFrom(UUID slotId, LocalDate from) {
        ScheduleSlot slot = slots.findById(slotId).orElseThrow();
        ClassType type = types.findById(slot.getClassTypeId()).orElseThrow();
        Box box = boxes.findById(slot.getBoxId()).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        Instant fromInstant = from.atStartOfDay(tz).toInstant();

        // Never touch a session that has already started. The generator floors recreation at now
        // (SessionGenerator:76,80), so a session earlier than that would be deleted and NEVER
        // refilled; and a session that has run may carry scores, which cascade
        // class_sessions -> session_item -> wod_score. Clamping here makes the delete range and
        // the recreate range identical, which is the property that was missing.
        Instant now = Instant.now();
        Instant floor = fromInstant.isBefore(now) ? now : fromInstant;

        List<ClassSession> inRange = sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, floor);

        List<String> blockingDates = inRange.stream()
                .filter(s -> bookings.existsBySessionIdAndStatusIn(s.getId(), BLOCKING))
                .map(s -> LocalDate.ofInstant(s.getStartAt(), tz).toString())
                .sorted().distinct().toList();

        if (!blockingDates.isEmpty()) {
            throw conflict("RANGE_HAS_BOOKINGS: " + String.join(", ", blockingDates));
        }

        // Nothing in inRange blocked above, so any booking still attached to these sessions is
        // CANCELLED — history, not a claim on a place. bookings.session_id and class_timers.session_id
        // have no ON DELETE CASCADE (V3, V9), so the delete below would otherwise fail on the FK.
        // Deleting them here deliberately discards cancellation history for the regenerated range —
        // bounded to `from` forward and to sessions nobody holds a live place on.
        // session_item (and wod_score through it) already cascades from class_sessions; no action needed.
        List<UUID> sessionIds = inRange.stream().map(ClassSession::getId).toList();
        bookings.deleteBySessionIdIn(sessionIds);
        timers.deleteBySessionIdIn(sessionIds);
        sessions.deleteAll(inRange);

        // Floor generation at `from`. Without it the generator restarts at today and refills the gap
        // between today and `from`, creating sessions BEFORE the date this method is named after.
        generator.generateForSlot(slot, type, tz, box.getBookingHorizonWeeks(), from);
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
