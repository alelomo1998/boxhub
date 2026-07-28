package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
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

    public SessionController(ClassSessionRepository sessions, BookingRepository bookings,
                            MembershipRepository memberships, UserRepository users, BookingService bookingService,
                            ApplicationEventPublisher events, MediaSigner mediaSigner) {
        this.sessions = sessions;
        this.bookings = bookings;
        this.memberships = memberships;
        this.users = users;
        this.bookingService = bookingService;
        this.events = events;
        this.mediaSigner = mediaSigner;
    }

    record SessionView(UUID id, String name, Instant startAt, int durationMin, int capacity, UUID coachId,
                       String coachName, String status, String programmingStatus, long bookedCount,
                       long waitlistCount, List<String> booked, String myBookingStatus, Integer myPosition) {}

    @Transactional(readOnly = true) // keep session open for lazy coach/athlete User names
    @GetMapping
    public List<SessionView> list(@RequestParam Instant from, @RequestParam Instant to) {
        Optional<Membership> caller = memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId());
        List<ClassSession> sessionList = sessions.findByStartAtBetweenOrderByStartAt(from, to);

        // coach names, resolved once
        Map<UUID, String> coachNames = new HashMap<>();
        for (ClassSession s : sessionList) {
            if (s.getCoachId() != null && !coachNames.containsKey(s.getCoachId())) {
                users.findById(s.getCoachId()).ifPresent(u -> coachNames.put(s.getCoachId(), u.getName()));
            }
        }

        List<SessionView> out = new ArrayList<>();
        for (ClassSession s : sessionList) {
            List<Booking> bookedRows = bookings.findBySessionIdAndStatusOrderByPosition(s.getId(), "BOOKED");
            List<String> bookedNames = new ArrayList<>();
            for (Booking b : bookedRows) {
                memberships.findById(b.getMembershipId()).ifPresent(m -> bookedNames.add(m.getUser().getName()));
            }
            long waitlist = bookings.countBySessionIdAndStatus(s.getId(), "WAITLIST");
            String myStatus = null; Integer myPos = null;
            if (caller.isPresent()) {
                var mine = bookings.findBySessionIdAndMembershipId(s.getId(), caller.get().getId());
                if (mine.isPresent()) { myStatus = mine.get().getStatus(); myPos = mine.get().getPosition(); }
            }
            out.add(new SessionView(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                    s.getCoachId(), s.getCoachId() == null ? null : coachNames.get(s.getCoachId()),
                    s.getStatus(), s.getProgrammingStatus(), bookedNames.size(), waitlist, bookedNames, myStatus, myPos));
        }
        return out;
    }

    record PatchSessionRequest(Integer capacity, UUID coachId, Instant startAt, String status) {}

    @PatchMapping("/{id}")
    public SessionView patch(@PathVariable UUID id, @RequestBody PatchSessionRequest req) {
        RoleGuard.requireStaff();
        ClassSession s = sessions.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter → 404
        if (req.capacity() != null && req.capacity() > 0) s.setCapacity(req.capacity());
        if (req.coachId() != null) s.setCoachId(req.coachId());
        if (req.startAt() != null) s.setStartAt(req.startAt());
        if ("CANCELLED".equals(req.status()) || "SCHEDULED".equals(req.status())) s.setStatus(req.status());
        sessions.save(s);
        long booked = bookings.countBySessionIdAndStatus(s.getId(), "BOOKED");
        long waitlist = bookings.countBySessionIdAndStatus(s.getId(), "WAITLIST");
        String coachName = s.getCoachId() == null ? null :
                users.findById(s.getCoachId()).map(User::getName).orElse(null);
        return new SessionView(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                s.getCoachId(), coachName, s.getStatus(), s.getProgrammingStatus(), booked, waitlist, List.of(), null, null);
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
