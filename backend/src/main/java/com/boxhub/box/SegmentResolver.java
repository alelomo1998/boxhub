package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** The three segments, in one place. Resolution runs ONCE, at send (D-2). Spec §5. */
@Service
public class SegmentResolver {

    public static final String EVERYONE = "EVERYONE";
    public static final String CLASS_ROSTER = "CLASS_ROSTER";
    public static final String EXPIRING = "EXPIRING";

    /**
     * 14, matching the staff members list. The segment is a STAFF-facing audience, so it must select
     * the same people staff already see flagged "expiring soon" there.
     * HomeController's athlete-facing 7-day banner is a different question and stays at 7.
     */
    public static final int EXPIRING_SOON_DAYS = 14;

    /**
     * D-7: waitlisted members are included — a cancellation is exactly what they need to hear.
     * Package-private (not private): AnnouncementController#targets computes recipientCount off
     * this SAME constant, not a re-typed copy, so the card's number and the preview's number
     * cannot drift apart by someone editing one and forgetting the other.
     */
    static final Set<String> ROSTER_STATUSES = Set.of("BOOKED", "CHECKED_IN", "WAITLIST");

    private final MembershipRepository memberships;
    private final BookingRepository bookings;
    private final SubscriptionService subscriptions;

    public SegmentResolver(MembershipRepository memberships, BookingRepository bookings,
                           SubscriptionService subscriptions) {
        this.memberships = memberships;
        this.bookings = bookings;
        this.subscriptions = subscriptions;
    }

    public List<UUID> resolve(String segment, UUID segmentRef) {
        return switch (segment) {
            case EVERYONE -> activeMemberIds();
            case CLASS_ROSTER -> roster(segmentRef);
            case EXPIRING -> expiring();
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UNKNOWN_SEGMENT");
        };
    }

    /**
     * Membership is NOT @TenantId, so this MUST be box-scoped explicitly. An unscoped read of every
     * membership on the platform is a standing banned grep for exactly this reason (M39 D-3 counted
     * every membership on the platform).
     */
    private List<UUID> activeMemberIds() {
        return memberships.findByBoxId(TenantContext.requireBoxId()).stream()
                .filter(m -> "ACTIVE".equals(m.getStatus()))
                .map(Membership::getId)
                .toList();
    }

    /** D-7: waitlisted members are included — a cancellation is exactly what they need to hear. */
    private List<UUID> roster(UUID sessionId) {
        if (sessionId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SEGMENT_REF_REQUIRED");
        return bookings.findBySessionId(sessionId).stream()
                .filter(b -> ROSTER_STATUSES.contains(b.getStatus()))
                .map(Booking::getMembershipId)
                .distinct()
                .toList();
    }

    /** A grandfathered subscription (null currentPeriodEnd) never counts as expiring. */
    private List<UUID> expiring() {
        Instant cutoff = Instant.now().plus(EXPIRING_SOON_DAYS, ChronoUnit.DAYS);
        return activeMemberIds().stream()
                .filter(id -> subscriptions.activeFor(id)
                        .map(Subscription::getCurrentPeriodEnd)
                        .filter(end -> end != null && end.isBefore(cutoff))
                        .isPresent())
                .toList();
    }
}
