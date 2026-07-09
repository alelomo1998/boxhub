package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Athlete-facing booking endpoints. Any box role may call these; membership resolves the caller. */
@RestController
@RequestMapping("/api/box")
public class BookingController {

    private final BookingService bookingService;
    private final MembershipRepository memberships;
    private final BookingRepository bookings;
    private final ClassSessionRepository sessions;

    public BookingController(BookingService bookingService, MembershipRepository memberships,
                             BookingRepository bookings, ClassSessionRepository sessions) {
        this.bookingService = bookingService;
        this.memberships = memberships;
        this.bookings = bookings;
        this.sessions = sessions;
    }

    record BookResponse(UUID bookingId, String status, Integer position) {}

    @PostMapping("/sessions/{id}/book")
    @ResponseStatus(HttpStatus.CREATED)
    public BookResponse book(@PathVariable UUID id) {
        Membership m = callerMembership();
        Booking b = bookingService.book(id, m.getId());
        return new BookResponse(b.getId(), b.getStatus(), b.getPosition());
    }

    @DeleteMapping("/sessions/{id}/booking")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID id) {
        Membership m = callerMembership();
        bookingService.cancel(id, m.getId());
    }

    record MyBookingDto(UUID sessionId, String sessionName, Instant startAt, String status, Integer position) {}

    @GetMapping("/my-bookings")
    public List<MyBookingDto> myBookings(@RequestParam Instant from) {
        Membership m = callerMembership();
        List<Booking> mine = bookings.findByMembershipId(m.getId());
        if (mine.isEmpty()) return List.of();

        Map<UUID, ClassSession> byId = sessions.findAllById(mine.stream().map(Booking::getSessionId).toList())
                .stream().collect(Collectors.toMap(ClassSession::getId, s -> s));

        List<MyBookingDto> result = new ArrayList<>();
        for (Booking b : mine) {
            ClassSession s = byId.get(b.getSessionId());
            if (s == null || s.getStartAt().isBefore(from)) continue;
            result.add(new MyBookingDto(s.getId(), s.getName(), s.getStartAt(), b.getStatus(), b.getPosition()));
        }
        result.sort(Comparator.comparing(MyBookingDto::startAt));
        return result;
    }

    private Membership callerMembership() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "NO_MEMBERSHIP"));
    }
}
