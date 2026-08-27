package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/** Admin dashboard headline KPIs (full analytics is milestone M8). */
@RestController
@RequestMapping("/api/box/admin-stats")
public class AdminStatsController {

    private final MembershipRepository memberships;
    private final ClassSessionRepository sessions;
    private final BookingRepository bookings;
    private final SubscriptionService subscriptions;

    public AdminStatsController(MembershipRepository memberships, ClassSessionRepository sessions,
                                BookingRepository bookings, SubscriptionService subscriptions) {
        this.memberships = memberships;
        this.sessions = sessions;
        this.bookings = bookings;
        this.subscriptions = subscriptions;
    }

    public record WeekAttendance(long checkins, long booked, long capacity, int fillPct) {}
    public record AdminStatsDto(long activeMembers, WeekAttendance weekAttendance, long expiringPlans) {}

    @GetMapping
    @Transactional(readOnly = true)
    public AdminStatsDto stats() {
        RoleGuard.requireBoxAdmin();

        // Membership carries no @TenantId discriminator (deliberately — it lets the box switcher
        // read one person's memberships across boxes), so this query must state its own box_id
        // predicate explicitly. findAll() here previously leaked every box's memberships into a
        // box admin's KPIs.
        List<Membership> all = memberships.findByBoxId(TenantContext.requireBoxId());
        long active = all.stream().filter(m -> "ACTIVE".equals(m.getStatus())).count();
        // M10: sourced from each membership's active Subscription's currentPeriodEnd, not the dead
        // Membership.expiresAt column (nothing writes it any more). A grandfathered subscription
        // (null end) never counts as expiring; same threshold/semantics as before, just re-sourced.
        long expiring = all.stream()
                .map(m -> subscriptions.activeFor(m.getId()).map(Subscription::getCurrentPeriodEnd).orElse(null))
                .filter(end -> end != null)
                .map(end -> end.atZone(ZoneId.systemDefault()).toLocalDate())
                .filter(end -> !end.isBefore(LocalDate.now()) && end.isBefore(LocalDate.now().plusDays(15)))
                .count();

        ZoneId zone = ZoneId.systemDefault();
        Instant weekStart = LocalDate.now(zone).with(DayOfWeek.MONDAY).atStartOfDay(zone).toInstant();
        Instant now = Instant.now();
        List<ClassSession> week = sessions.findByStartAtBetweenOrderByStartAt(weekStart, now).stream()
                .filter(s -> !"CANCELLED".equals(s.getStatus())).toList();
        long capacity = week.stream().mapToLong(ClassSession::getCapacity).sum();
        long booked = 0, checkins = 0;
        for (ClassSession s : week) {
            booked += bookings.countBySessionIdAndStatus(s.getId(), "BOOKED")
                    + bookings.countBySessionIdAndStatus(s.getId(), "CHECKED_IN");
            checkins += bookings.countBySessionIdAndStatus(s.getId(), "CHECKED_IN");
        }
        int fillPct = capacity == 0 ? 0 : (int) Math.round(100.0 * booked / capacity);
        return new AdminStatsDto(active, new WeekAttendance(checkins, booked, capacity, fillPct), expiring);
    }
}
