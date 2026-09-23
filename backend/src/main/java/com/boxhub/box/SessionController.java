package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.notify.NotificationService;
import com.boxhub.notify.NotificationType;
import com.boxhub.shared.MediaSigner;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.constraints.NotNull;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Session listing (any box role, with caller state) + coach session management, roster, check-in. */
@RestController
@RequestMapping("/api/box/sessions")
public class SessionController {

    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final BookingService bookingService;
    private final ApplicationEventPublisher events;
    private final MediaSigner mediaSigner;
    private final NotificationService notifications;
    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;

    public SessionController(ClassSessionRepository sessions, BookingRepository bookings,
                            MembershipRepository memberships, UserRepository users, BookingService bookingService,
                            ApplicationEventPublisher events, MediaSigner mediaSigner, NotificationService notifications,
                            ScheduleSlotRepository slots, ClassTypeRepository types) {
        this.sessions = sessions;
        this.bookings = bookings;
        this.memberships = memberships;
        this.users = users;
        this.bookingService = bookingService;
        this.events = events;
        this.mediaSigner = mediaSigner;
        this.notifications = notifications;
        this.slots = slots;
        this.types = types;
    }

    record SessionView(UUID id, String name, Instant startAt, int durationMin, int capacity, UUID coachId,
                       String coachName, String status, String programmingStatus, long bookedCount,
                       long waitlistCount, List<String> booked, String myBookingStatus, Integer myPosition,
                       String imagePath, String coachAvatarPath, List<Person> people) {}

    public record Person(String name, String avatarPath) {}

    @Transactional(readOnly = true) // keep session open for lazy coach/athlete User names
    @GetMapping
    public List<SessionView> list(@RequestParam Instant from, @RequestParam Instant to) {
        Optional<Membership> caller = memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId());
        List<ClassSession> sessionList = sessions.findByStartAtBetweenOrderByStartAt(from, to);

        // coach names + avatars, resolved once per coach id
        Map<UUID, String> coachNames = new HashMap<>();
        Map<UUID, String> coachAvatars = new HashMap<>();
        for (ClassSession s : sessionList) {
            if (s.getCoachId() != null && !coachNames.containsKey(s.getCoachId())) {
                users.findById(s.getCoachId()).ifPresent(u -> coachNames.put(s.getCoachId(), u.getName()));
                memberships.findByUserIdAndBoxId(s.getCoachId(), TenantContext.requireBoxId())
                        .map(Membership::getAvatarPath).map(mediaSigner::sign)
                        .ifPresent(a -> coachAvatars.put(s.getCoachId(), a));
            }
        }

        // One lookup per distinct slot and type, not per row: the list can span a month of sessions.
        Map<UUID, String> imageBySlot = new HashMap<>();
        for (UUID slotId : sessionList.stream().map(ClassSession::getScheduleSlotId)
                .filter(Objects::nonNull).distinct().toList()) {
            slots.findById(slotId).flatMap(sl -> types.findById(sl.getClassTypeId()))
                    .map(ClassType::getImagePath)
                    .ifPresent(p -> imageBySlot.put(slotId, mediaSigner.sign(p)));
        }

        List<SessionView> out = new ArrayList<>();
        for (ClassSession s : sessionList) {
            List<Booking> bookedRows = bookings.findBySessionIdAndStatusInOrderByPosition(s.getId(), BookingRepository.IN_CLASS);
            List<String> bookedNames = new ArrayList<>();
            List<Person> people = new ArrayList<>();
            for (Booking b : bookedRows) {
                if (b.getMembershipId() == null) continue; // a drop-in visitor: counted, not named
                memberships.findById(b.getMembershipId()).ifPresent(m -> {
                    bookedNames.add(m.getUser().getName());
                    if (people.size() < 5) people.add(new Person(m.getUser().getName(), mediaSigner.sign(m.getAvatarPath())));
                });
            }
            long waitlist = bookings.countBySessionIdAndStatus(s.getId(), "WAITLIST");
            String myStatus = null; Integer myPos = null;
            if (caller.isPresent()) {
                var mine = bookings.findBySessionIdAndMembershipIdAndStatusNot(s.getId(), caller.get().getId(), "CANCELLED");
                if (mine.isPresent()) { myStatus = mine.get().getStatus(); myPos = mine.get().getPosition(); }
            }
            out.add(new SessionView(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                    s.getCoachId(), s.getCoachId() == null ? null : coachNames.get(s.getCoachId()),
                    s.getStatus(), s.getProgrammingStatus(), bookedRows.size(), waitlist, bookedNames, myStatus, myPos,
                    s.getScheduleSlotId() == null ? null : imageBySlot.get(s.getScheduleSlotId()),
                    s.getCoachId() == null ? null : coachAvatars.get(s.getCoachId()), people));
        }
        return out;
    }

    record PatchSessionRequest(Integer capacity, UUID coachId, Instant startAt, String status) {}

    // @Transactional: emitting a notification below requires an open transaction (NotificationService
    // is Propagation.MANDATORY, M29b D-4 — the feed row is persistence and must vanish with a
    // rollback, like an audit row). This method had none before M29b.
    @Transactional
    @PatchMapping("/{id}")
    public SessionView patch(@PathVariable UUID id, @RequestBody PatchSessionRequest req) {
        RoleGuard.requireStaff();
        ClassSession s = sessions.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter → 404
        // Captured BEFORE the setters: after them, "did this change?" is unanswerable, and a PATCH
        // that echoes the current value is routine — it must not fire a notification.
        Instant previousStartAt = s.getStartAt();
        UUID previousCoachId = s.getCoachId();
        String previousStatus = s.getStatus();

        if (req.capacity() != null && req.capacity() > 0) s.setCapacity(req.capacity());
        if (req.coachId() != null) s.setCoachId(req.coachId());
        if (req.startAt() != null) s.setStartAt(req.startAt());
        if ("CANCELLED".equals(req.status()) || "SCHEDULED".equals(req.status())) s.setStatus(req.status());
        sessions.save(s);
        long booked = bookings.countBySessionIdAndStatusIn(s.getId(), BookingRepository.IN_CLASS);
        long waitlist = bookings.countBySessionIdAndStatus(s.getId(), "WAITLIST");
        String coachName = s.getCoachId() == null ? null :
                users.findById(s.getCoachId()).map(User::getName).orElse(null);

        boolean nowCancelled = "CANCELLED".equals(s.getStatus()) && !"CANCELLED".equals(previousStatus);
        boolean timeMoved = !s.getStartAt().equals(previousStartAt);
        boolean coachSwapped = s.getCoachId() != null && !s.getCoachId().equals(previousCoachId);
        if (nowCancelled || timeMoved || coachSwapped) {
            notifyRoster(s, previousStartAt, coachName, nowCancelled, timeMoved, coachSwapped);
        }

        return new SessionView(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                s.getCoachId(), coachName, s.getStatus(), s.getProgrammingStatus(), booked, waitlist, List.of(), null, null, null,
                null, List.of());
    }

    /**
     * The roster INCLUDING the waitlist (M29a D-7): "tomorrow's 6am is cancelled" is precisely the
     * message someone waiting for a spot needs. ROSTER_STATUSES is the same set announcements use,
     * so the two surfaces cannot disagree about who is on a roster, and distinct() matters because
     * one membership can hold two rows for one session.
     *
     * Cancellation wins when several things changed at once: a member whose class was cancelled does
     * not also need to be told its new coach.
     */
    private void notifyRoster(ClassSession s, Instant previousStartAt, String coachName,
                              boolean cancelled, boolean timeMoved, boolean coachSwapped) {
        List<UUID> roster = bookings.findBySessionId(s.getId()).stream()
                .filter(b -> SegmentResolver.ROSTER_STATUSES.contains(b.getStatus()))
                .map(Booking::getMembershipId)
                .distinct()
                .toList();
        if (roster.isEmpty()) return;

        Map<String, Object> base = new HashMap<>();
        base.put(NotificationType.SESSION_ID, s.getId().toString());
        base.put(NotificationType.CLASS_NAME, s.getName());
        base.put(NotificationType.START_AT, s.getStartAt().toString());

        if (cancelled) {
            notifications.emitAll(NotificationType.CLASS_CANCELLED, roster, base);
            return;
        }
        if (timeMoved) {
            Map<String, Object> moved = new HashMap<>(base);
            moved.put(NotificationType.OLD_START_AT, previousStartAt.toString());
            moved.put(NotificationType.NEW_START_AT, s.getStartAt().toString());
            notifications.emitAll(NotificationType.CLASS_TIME_CHANGED, roster, moved);
        }
        if (coachSwapped) {
            Map<String, Object> swapped = new HashMap<>(base);
            swapped.put(NotificationType.COACH_NAME, coachName);
            notifications.emitAll(NotificationType.COACH_CHANGED, roster, swapped);
        }
    }

    record RosterEntry(UUID bookingId, UUID membershipId, String name, String email, String avatarPath, String status, Integer position) {}

    @org.springframework.transaction.annotation.Transactional(readOnly = true) // keep session open for lazy User
    @GetMapping("/{id}/roster")
    public List<RosterEntry> roster(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        // ensure the session is in-tenant (foreign → 404)
        sessions.findById(id).orElseThrow(NoSuchElementException::new);
        List<RosterEntry> out = new ArrayList<>();
        for (Booking b : bookings.findBySessionId(id)) {
            Membership m = memberships.findById(b.getMembershipId()).orElse(null);
            String name = m != null ? m.getUser().getName() : "";
            String email = m != null ? m.getUser().getEmail() : "";
            String avatar = m != null ? mediaSigner.sign(m.getAvatarPath()) : null;
            out.add(new RosterEntry(b.getId(), b.getMembershipId(), name, email, avatar, b.getStatus(), b.getPosition()));
        }
        return out;
    }

    // @NotNull documents the contract; it is NOT enforced via @Valid on the controller params
    // below — AuthzConformanceTest pins that authorization (RoleGuard + the tenant-scoped
    // session lookup) must run BEFORE any input validation, so an unauthorized/cross-tenant
    // caller with a malformed body still gets 403/404, never a 400 that leaks past the guard.
    // @Valid on a @RequestBody runs during argument resolution, before the method body's
    // RoleGuard call, which would invert that order — so the null check is manual, after both
    // guards.
    record BookingIdRequest(@NotNull UUID bookingId) {}

    @PostMapping("/{id}/checkin")
    public void checkIn(@PathVariable UUID id, @RequestBody BookingIdRequest req) {
        RoleGuard.requireStaff();
        sessions.findById(id).orElseThrow(NoSuchElementException::new);
        requireBookingId(req);
        bookingService.checkIn(req.bookingId());
        events.publishEvent(new com.boxhub.display.TvStateChanged(TenantContext.requireBoxId()));
    }

    @PostMapping("/{id}/uncheck")
    public void uncheck(@PathVariable UUID id, @RequestBody BookingIdRequest req) {
        RoleGuard.requireStaff();
        sessions.findById(id).orElseThrow(NoSuchElementException::new);
        requireBookingId(req);
        bookingService.uncheck(req.bookingId());
        events.publishEvent(new com.boxhub.display.TvStateChanged(TenantContext.requireBoxId()));
    }

    @PostMapping("/{id}/no-show")
    public void noShow(@PathVariable UUID id, @RequestBody BookingIdRequest req) {
        RoleGuard.requireStaff();
        sessions.findById(id).orElseThrow(NoSuchElementException::new);
        requireBookingId(req);
        bookingService.markNoShow(req.bookingId());
        events.publishEvent(new com.boxhub.display.TvStateChanged(TenantContext.requireBoxId()));
    }

    private static void requireBookingId(BookingIdRequest req) {
        if (req.bookingId() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bookingId required");
    }
}
