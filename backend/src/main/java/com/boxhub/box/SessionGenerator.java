package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.*;
import java.util.UUID;

/**
 * Materializes concrete class_sessions from active schedule slots up to the box's booking horizon.
 * Runs on slot create/reactivate (tenant already set) and nightly for every box.
 * The nightly path has no ambient tenant, so it establishes a synthetic box tenant per box
 * so the @TenantId box_id on ClassSession populates correctly (see ADR-001).
 */
@Service
public class SessionGenerator {

    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final ClassSessionRepository sessions;
    private final BoxRepository boxes;
    private final TransactionTemplate tx;

    public SessionGenerator(ScheduleSlotRepository slots, ClassTypeRepository types, ClassSessionRepository sessions,
                            BoxRepository boxes, PlatformTransactionManager txManager) {
        this.slots = slots;
        this.types = types;
        this.sessions = sessions;
        this.boxes = boxes;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Generate for one box. NOT @Transactional: the tenant must be established (runAsBox) BEFORE the
     * Hibernate session opens, or @TenantId resolves to the NO_TENANT sentinel. So we set the tenant
     * first, then open the tx via TransactionTemplate inside it.
     */
    public void generateForBox(UUID boxId) {
        Box box = boxes.findById(boxId).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        int horizonWeeks = box.getBookingHorizonWeeks();
        TenantContext.runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            for (ScheduleSlot slot : slots.findByActiveTrue()) {
                ClassType type = types.findById(slot.getClassTypeId()).orElseThrow();
                generateForSlot(slot, type, tz, horizonWeeks);
            }
        }));
    }

    /** Assumes the current tenant is the slot's box (create path sets it; generateForBox sets it). */
    public void generateForSlot(ScheduleSlot slot, ClassType type, ZoneId tz, int horizonWeeks) {
        generateForSlot(slot, type, tz, horizonWeeks, null);
    }

    /**
     * `notBefore` floors generation at a date instead of today. The nightly job passes null and is
     * unaffected; only {@code SlotRegenerationService.regenerateFrom} passes a value.
     *
     * <p>Without it, "regenerate from Tuesday" also recreated Monday's session: this loop started at
     * today regardless, so every slot occurrence between today and the caller's `from` that did not
     * already exist got created BEFORE the date the caller asked to regenerate from — contradicting
     * both the method's name and its own test. It only surfaced when `from` landed later in the week
     * than the slot's own weekday, which is why it passed on 2026-08-20 and failed on 2026-08-22.
     *
     * <p>The horizon end stays anchored to today, not to the floor: a regeneration starting in the
     * future must not also extend how far ahead the box generates.
     */
    public void generateForSlot(ScheduleSlot slot, ClassType type, ZoneId tz, int horizonWeeks,
                                LocalDate notBefore) {
        DayOfWeek target = DayOfWeek.of(slot.getWeekday() + 1); // 0=Mon -> MONDAY(1)
        LocalDate today = LocalDate.now(tz);
        LocalDate end = today.plusWeeks(horizonWeeks);
        LocalDate start = (notBefore == null || notBefore.isBefore(today)) ? today : notBefore;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            if (d.getDayOfWeek() != target) continue;
            Instant startAt = ZonedDateTime.of(d, slot.getStartTime(), tz).toInstant();
            if (startAt.isBefore(Instant.now())) continue;                             // no past slots
            if (sessions.existsByScheduleSlotIdAndStartAt(slot.getId(), startAt)) continue; // idempotent
            ClassSession s = new ClassSession();
            s.setScheduleSlotId(slot.getId());
            s.setName(type.getName());          // identity from the type
            s.setStartAt(startAt);
            s.setDurationMin(slot.getDurationMin());   // numbers snapshot from the slot
            s.setCapacity(slot.getCapacity());
            s.setCoachId(slot.getCoachId());
            sessions.save(s);
        }
    }

    /** Nightly: every box up to its horizon. Cron won't fire during short test runs. */
    @Scheduled(cron = "0 0 3 * * *")
    public void generateAll() {
        for (Box b : boxes.findAll()) {
            generateForBox(b.getId());
        }
    }
}
