package com.boxhub.box;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * The only place entitlement_usage rows are written or counted.
 * <p>
 * Every write here runs INSIDE the caller's transaction (no REQUIRES_NEW), so a rolled-back booking
 * cannot leave a consumed entry behind — the same rule this project already applies to audit rows.
 */
@Service
public class EntitlementLedger {

    private final EntitlementUsageRepository usage;

    public EntitlementLedger(EntitlementUsageRepository usage) {
        this.usage = usage;
    }

    /**
     * The first rule in {@code rules} whose limit is set AND already met, or null if every set limit
     * has room. Rules arrive in TOTAL -> MONTH -> WEEK -> DAY order so the code identifies which rule
     * stopped the member; the pass/fail outcome is order-independent because the limits compose with AND.
     */
    public String firstViolated(List<PlanLimits.Rule> rules, Plan plan, Subscription sub,
                                Instant sessionStartAt, ZoneId tz, UUID membershipId) {
        for (PlanLimits.Rule rule : rules) {
            Integer limit = rule.limit().apply(plan);
            if (limit == null) continue; // NULL means unlimited
            Instant[] w = PlanLimits.window(rule.period(), sessionStartAt, tz, sub);
            if (usage.countInWindow(membershipId, rule.kind().name(), w[0], w[1]) >= limit) return rule.code();
        }
        return null;
    }

    @Transactional
    public void recordEntry(UUID bookingId, UUID membershipId, Subscription sub, Instant sessionStartAt) {
        insert(bookingId, membershipId, sub, sessionStartAt, PlanLimits.UsageKind.ENTRY);
    }

    @Transactional
    public void recordCancellation(UUID bookingId, UUID membershipId, Subscription sub, Instant sessionStartAt) {
        insert(bookingId, membershipId, sub, sessionStartAt, PlanLimits.UsageKind.CANCELLATION);
    }

    /**
     * Flips this booking's ENTRY row to refunded so it stops counting. Append-only in the sense that
     * matters — no row is ever deleted, and the CANCELLATION row that accompanies a refund is a new
     * row, not an edit.
     * <p>
     * Silently does nothing when there is no ENTRY row: a booking made before V28 and outside the
     * backfill's 35-day floor has none, and refusing to let that member cancel would be worse than
     * letting one stale entry go uncounted.
     */
    @Transactional
    public void refundEntry(UUID bookingId) {
        usage.findByBookingIdAndKind(bookingId, PlanLimits.UsageKind.ENTRY.name()).ifPresent(row -> {
            row.setRefunded(true);
            usage.save(row);
        });
    }

    private void insert(UUID bookingId, UUID membershipId, Subscription sub, Instant sessionStartAt,
                        PlanLimits.UsageKind kind) {
        EntitlementUsage u = new EntitlementUsage();
        u.setSubscriptionId(sub.getId());
        u.setMembershipId(membershipId);
        u.setBookingId(bookingId);
        u.setSessionStartAt(sessionStartAt);
        u.setKind(kind.name());
        usage.save(u);
    }
}
