package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.performance.PerformanceQueries;
import com.boxhub.programming.Movement;
import com.boxhub.programming.MovementRepository;
import com.boxhub.shared.MediaSigner;
import com.boxhub.shared.TenantContext;

import static com.boxhub.box.SegmentResolver.EXPIRING_SOON_DAYS;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/** Athlete home info-hub aggregate: next booking, announcement, mini stats. */
@RestController
@RequestMapping("/api/box/home")
public class HomeController {

    private final BookingRepository bookings;
    private final ClassSessionRepository sessions;
    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final MembershipRepository memberships;
    private final AnnouncementRecipientRepository recipients;
    private final PerformanceQueries queries;
    private final LiftEntryRepository lifts;
    private final MovementRepository movements;
    private final SubscriptionService subscriptions;
    private final MediaSigner mediaSigner;
    private final UserRepository users;
    private final BoxRepository boxes;

    public HomeController(BookingRepository bookings, ClassSessionRepository sessions,
                          ScheduleSlotRepository slots, ClassTypeRepository types, MembershipRepository memberships,
                          AnnouncementRecipientRepository recipients, PerformanceQueries queries,
                          LiftEntryRepository lifts, MovementRepository movements,
                          SubscriptionService subscriptions, MediaSigner mediaSigner, UserRepository users,
                          BoxRepository boxes) {
        this.bookings = bookings;
        this.sessions = sessions;
        this.slots = slots;
        this.types = types;
        this.memberships = memberships;
        this.recipients = recipients;
        this.queries = queries;
        this.lifts = lifts;
        this.movements = movements;
        this.subscriptions = subscriptions;
        this.mediaSigner = mediaSigner;
        this.users = users;
        this.boxes = boxes;
    }

    public record Participant(String name, String avatarPath) {}
    public record NextBooking(UUID sessionId, String className, Instant startAt, String imagePath,
                              String status, Integer waitlistPosition, List<Participant> participants,
                              int bookedCount, int capacity) {}
    public record LastPr(String movementName, java.math.BigDecimal load, LocalDate performedOn) {}
    public record Stats(long checkinsThisWeek, int streakWeeks, Long planDaysLeft, LastPr lastPr) {}
    /** sentByName is null for a system/seed send (sentBy null) — never the box name or a placeholder. */
    public record AnnouncementView(String body, Instant updatedAt, String sentByName) {}
    public record Suggestion(UUID sessionId, String name, Instant startAt, String imagePath,
                             int bookedCount, int capacity) {}
    public record HomeDto(NextBooking nextBooking, AnnouncementView announcement, Stats stats,
                          boolean planExpiringSoon, long announcementUnread, boolean hasActivePlan,
                          List<LocalDate> attendedThisWeek, Suggestion suggestion) {}

    @GetMapping
    @Transactional(readOnly = true)
    public HomeDto home() {
        Membership me = memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));

        NextBooking next = nextBooking(me.getId());
        // M29a (D-4): the latest announcement ADDRESSED TO ME, not "the box's one row". A member outside
        // a segment correctly sees nothing. The DTO shape is unchanged, so the screen does not move.
        AnnouncementView ann = recipients
                .findLatestBodyForMember(me.getId(), org.springframework.data.domain.PageRequest.of(0, 1))
                .stream().findFirst()
                .map(a -> new AnnouncementView(a.getBody(), a.getSentAt(), senderName(a.getSentBy())))
                .orElse(null);

        ZoneId zone = boxes.findById(TenantContext.requireBoxId())
                .map(b -> ZoneId.of(b.getTimezone())).orElse(ZoneId.systemDefault());
        Instant weekStart = LocalDate.now(zone).with(DayOfWeek.MONDAY).atStartOfDay(zone).toInstant();
        Instant weekEnd = LocalDate.now(zone).with(DayOfWeek.MONDAY).plusWeeks(1).atStartOfDay(zone).toInstant();
        long checkins = bookings.countInWeek(me.getId(), weekStart, weekEnd);
        List<LocalDate> attended = bookings.attendedStartsBetween(me.getId(), weekStart, weekEnd).stream()
                .map(i -> i.atZone(zone).toLocalDate()).distinct().sorted().toList();

        // M10: sourced from the active Subscription's currentPeriodEnd, not the dead
        // Membership.expiresAt column — nothing writes that any more (recordPeriod, invite accept,
        // the webhook and the lapse job all write Subscription.currentPeriodEnd instead). A
        // grandfathered subscription (null end) is never expiring.
        Optional<Subscription> activeSub = subscriptions.activeFor(me.getId());
        boolean hasActivePlan = activeSub.isPresent();
        Instant subEnd = activeSub.map(Subscription::getCurrentPeriodEnd).orElse(null);
        Long planDaysLeft = subEnd == null ? null
                : java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(zone), subEnd.atZone(zone).toLocalDate());

        LastPr lastPr = lifts.findByMembershipIdOrderByPerformedOnDesc(me.getId()).stream()
                .filter(LiftEntry::isPr).findFirst()
                .map(l -> new LastPr(movementName(l.getMovementId()), l.getLoad(), l.getPerformedOn()))
                .orElse(null);

        Stats stats = new Stats(checkins, queries.streakWeeks(me.getId()), planDaysLeft, lastPr);
        // One number, everywhere a person is told about expiry: this banner, the staff "expiring"
        // announcement segment, the members-table chip and SUBSCRIPTION_EXPIRING. A banner that
        // disagreed with a badge about who is expiring is worse than either (M29b D-12).
        boolean expiring = planDaysLeft != null && planDaysLeft >= 0 && planDaysLeft <= EXPIRING_SOON_DAYS;
        long unread = recipients.countByMembershipIdAndReadAtIsNull(me.getId());
        // The card only shows with nothing booked — skip the habit query entirely when there's
        // already a next booking to show.
        Suggestion suggestion = next == null ? suggestion(me.getId()) : null;
        return new HomeDto(next, ann, stats, expiring, unread, hasActivePlan, attended, suggestion);
    }

    /** Null sentBy (system/seed sends) skips the lookup entirely rather than calling findById(null). */
    private String senderName(UUID sentBy) {
        return sentBy == null ? null : users.findById(sentBy).map(User::getName).orElse(null);
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
        String image = mediaSigner.sign(s.getScheduleSlotId() == null ? null
                : slots.findById(s.getScheduleSlotId()).flatMap(sl -> types.findById(sl.getClassTypeId()))
                        .map(ClassType::getImagePath).orElse(null));

        // Membership carries no @TenantId discriminator (deliberately -- the box switcher reads one
        // person's memberships across boxes), so every query on it must state its own box predicate.
        // findAll() here pulled EVERY box's memberships into memory on each request.
        Map<UUID, Membership> memberById = memberships.findByBoxId(TenantContext.requireBoxId()).stream()
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

    /**
     * Habit suggestion (spec §2.5): slots with >= 2 CHECKED_IN bookings in the last 8 weeks, walked
     * in tiers of equal count (highest first). Within a tier, each slot's earliest eligible SCHEDULED
     * session in the next 7 days is a candidate (no non-CANCELLED booking already held, not full);
     * the first tier with any candidate wins.
     */
    private Suggestion suggestion(UUID membershipId) {
        Instant now = Instant.now();
        List<Object[]> habits = bookings.attendedSlotCounts(membershipId, now.minus(Duration.ofDays(56)), now);
        int i = 0;
        while (i < habits.size()) {
            long tier = (Long) habits.get(i)[1];
            ClassSession best = null;
            for (; i < habits.size() && (Long) habits.get(i)[1] == tier; i++) {
                UUID slotId = (UUID) habits.get(i)[0];
                for (ClassSession s : sessions.findByScheduleSlotIdAndStatusAndStartAtBetweenOrderByStartAt(
                        slotId, "SCHEDULED", now, now.plus(Duration.ofDays(7)))) {
                    if (!s.getStartAt().isAfter(now)) continue;
                    if (bookings.findBySessionIdAndMembershipIdAndStatusNot(s.getId(), membershipId, "CANCELLED").isPresent()) continue;
                    if (bookings.countBySessionIdAndStatusIn(s.getId(), BookingRepository.IN_CLASS) >= s.getCapacity()) continue;
                    if (best == null || s.getStartAt().isBefore(best.getStartAt())) best = s;
                    break; // sessions are ordered: the first eligible one is this slot's earliest
                }
            }
            if (best != null) {
                String image = mediaSigner.sign(slots.findById(best.getScheduleSlotId())
                        .flatMap(sl -> types.findById(sl.getClassTypeId())).map(ClassType::getImagePath).orElse(null));
                int booked = (int) bookings.countBySessionIdAndStatusIn(best.getId(), BookingRepository.IN_CLASS);
                return new Suggestion(best.getId(), best.getName(), best.getStartAt(), image, booked, best.getCapacity());
            }
        }
        return null;
    }
}
