package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.performance.PerformanceQueries;
import com.boxhub.programming.Movement;
import com.boxhub.programming.MovementRepository;
import com.boxhub.shared.MediaSigner;
import com.boxhub.shared.TenantContext;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Athlete home info-hub aggregate: next booking, announcement, mini stats. */
@RestController
@RequestMapping("/api/box/home")
public class HomeController {

    private final BookingRepository bookings;
    private final ClassSessionRepository sessions;
    private final ClassTemplateRepository templates;
    private final MembershipRepository memberships;
    private final AnnouncementRepository announcements;
    private final PerformanceQueries queries;
    private final LiftEntryRepository lifts;
    private final MovementRepository movements;
    private final SubscriptionService subscriptions;
    private final MediaSigner mediaSigner;

    public HomeController(BookingRepository bookings, ClassSessionRepository sessions,
                          ClassTemplateRepository templates, MembershipRepository memberships,
                          AnnouncementRepository announcements, PerformanceQueries queries,
                          LiftEntryRepository lifts, MovementRepository movements,
                          SubscriptionService subscriptions, MediaSigner mediaSigner) {
        this.bookings = bookings;
        this.sessions = sessions;
        this.templates = templates;
        this.memberships = memberships;
        this.announcements = announcements;
        this.queries = queries;
        this.lifts = lifts;
        this.movements = movements;
        this.subscriptions = subscriptions;
        this.mediaSigner = mediaSigner;
    }

    public record Participant(String name, String avatarPath) {}
    public record NextBooking(UUID sessionId, String className, Instant startAt, String imagePath,
                              String status, Integer waitlistPosition, List<Participant> participants,
                              int bookedCount, int capacity) {}
    public record LastPr(String movementName, java.math.BigDecimal load, LocalDate performedOn) {}
    public record Stats(long checkinsThisWeek, int streakWeeks, Long planDaysLeft, LastPr lastPr) {}
    public record AnnouncementView(String body, Instant updatedAt) {}
    public record HomeDto(NextBooking nextBooking, AnnouncementView announcement, Stats stats,
                          boolean planExpiringSoon) {}

    @GetMapping
    @Transactional(readOnly = true)
    public HomeDto home() {
        Membership me = memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));

        NextBooking next = nextBooking(me.getId());
        AnnouncementView ann = announcements.findAll().stream().findFirst()
                .map(a -> new AnnouncementView(a.getBody(), a.getUpdatedAt())).orElse(null);

        ZoneId zone = ZoneId.systemDefault();
        Instant weekStart = LocalDate.now(zone).with(DayOfWeek.MONDAY).atStartOfDay(zone).toInstant();
        Instant weekEnd = LocalDate.now(zone).with(DayOfWeek.MONDAY).plusWeeks(1).atStartOfDay(zone).toInstant();
        long checkins = bookings.countInWeek(me.getId(), weekStart, weekEnd);

        // M10: sourced from the active Subscription's currentPeriodEnd, not the dead
        // Membership.expiresAt column — nothing writes that any more (recordPeriod, invite accept,
        // the webhook and the lapse job all write Subscription.currentPeriodEnd instead). A
        // grandfathered subscription (null end) is never expiring.
        Instant subEnd = subscriptions.activeFor(me.getId()).map(Subscription::getCurrentPeriodEnd).orElse(null);
        Long planDaysLeft = subEnd == null ? null
                : java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), subEnd.atZone(zone).toLocalDate());

        LastPr lastPr = lifts.findByMembershipIdOrderByPerformedOnDesc(me.getId()).stream()
                .filter(LiftEntry::isPr).findFirst()
                .map(l -> new LastPr(movementName(l.getMovementId()), l.getLoad(), l.getPerformedOn()))
                .orElse(null);

        Stats stats = new Stats(checkins, queries.streakWeeks(me.getId()), planDaysLeft, lastPr);
        boolean expiring = planDaysLeft != null && planDaysLeft >= 0 && planDaysLeft <= 7;
        return new HomeDto(next, ann, stats, expiring);
    }

    private String movementName(UUID movementId) {
        return movements.findVisible(TenantContext.requireBoxId()).stream()
                .filter(m -> m.getId().equals(movementId)).findFirst().map(Movement::getName).orElse("—");
    }

    private NextBooking nextBooking(UUID membershipId) {
        Map<UUID, ClassSession> sessionById = sessions.findAll().stream()
                .collect(Collectors.toMap(ClassSession::getId, s -> s, (a, b) -> a));
        Booking next = bookings.findByMembershipId(membershipId).stream()
                .filter(b -> "BOOKED".equals(b.getStatus()) || "WAITLIST".equals(b.getStatus()))
                .map(b -> Map.entry(b, sessionById.get(b.getSessionId())))
                .filter(e -> e.getValue() != null && e.getValue().getStartAt().isAfter(Instant.now().minusSeconds(3600)))
                .sorted(Comparator.comparing(e -> e.getValue().getStartAt()))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        if (next == null) return null;

        ClassSession s = sessionById.get(next.getSessionId());
        String image = mediaSigner.sign(s.getTemplateId() == null ? null
                : templates.findById(s.getTemplateId()).map(ClassTemplate::getImagePath).orElse(null));

        Map<UUID, Membership> memberById = memberships.findAll().stream()
                .collect(Collectors.toMap(Membership::getId, m -> m, (a, b) -> a));
        List<Booking> active = bookings.findBySessionId(s.getId()).stream()
                .filter(b -> "BOOKED".equals(b.getStatus()) || "CHECKED_IN".equals(b.getStatus())).toList();
        List<Participant> participants = active.stream().limit(6)
                .map(b -> {
                    Membership m = memberById.get(b.getMembershipId());
                    return new Participant(m == null ? "—" : m.getUser().getName(),
                            m == null ? null : mediaSigner.sign(m.getAvatarPath()));
                }).toList();

        return new NextBooking(s.getId(), s.getName(), s.getStartAt(), image, next.getStatus(),
                next.getPosition(), participants, active.size(), s.getCapacity());
    }
}
