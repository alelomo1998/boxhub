package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
    private final BookingService bookingService;

    public SessionController(ClassSessionRepository sessions, BookingRepository bookings,
                            MembershipRepository memberships, BookingService bookingService) {
        this.sessions = sessions;
        this.bookings = bookings;
        this.memberships = memberships;
        this.bookingService = bookingService;
    }

    record SessionView(UUID id, String name, Instant startAt, int durationMin, int capacity, UUID coachId,
                       String status, long bookedCount, long waitlistCount,
                       String myBookingStatus, Integer myPosition) {}

    @GetMapping
    public List<SessionView> list(@RequestParam Instant from, @RequestParam Instant to) {
        Optional<Membership> caller = memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId());
        List<SessionView> out = new ArrayList<>();
        for (ClassSession s : sessions.findByStartAtBetweenOrderByStartAt(from, to)) {
            long booked = bookings.countBySessionIdAndStatus(s.getId(), "BOOKED");
            long waitlist = bookings.countBySessionIdAndStatus(s.getId(), "WAITLIST");
            String myStatus = null; Integer myPos = null;
            if (caller.isPresent()) {
                var mine = bookings.findBySessionIdAndMembershipId(s.getId(), caller.get().getId());
                if (mine.isPresent()) { myStatus = mine.get().getStatus(); myPos = mine.get().getPosition(); }
            }
            out.add(new SessionView(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                    s.getCoachId(), s.getStatus(), booked, waitlist, myStatus, myPos));
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
        return new SessionView(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                s.getCoachId(), s.getStatus(), booked, waitlist, null, null);
    }

    record RosterEntry(UUID bookingId, String name, String email, String status, Integer position) {}

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
            out.add(new RosterEntry(b.getId(), name, email, b.getStatus(), b.getPosition()));
        }
        return out;
    }

    record BookingIdRequest(UUID bookingId) {}

    @PostMapping("/{id}/checkin")
    public void checkIn(@PathVariable UUID id, @RequestBody BookingIdRequest req) {
        RoleGuard.requireStaff();
        sessions.findById(id).orElseThrow(NoSuchElementException::new);
        bookingService.checkIn(req.bookingId());
    }

    @PostMapping("/{id}/no-show")
    public void noShow(@PathVariable UUID id, @RequestBody BookingIdRequest req) {
        RoleGuard.requireStaff();
        sessions.findById(id).orElseThrow(NoSuchElementException::new);
        bookingService.markNoShow(req.bookingId());
    }
}
