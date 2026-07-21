package com.boxhub.box;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Create-or-extend rules for the membership <-> plan subscription. The single-ACTIVE-per-membership
 * invariant is enforced here with a plain read-then-check (see recordPeriod) and backstopped by the
 * partial unique index uq_subscription_active (migration V14). recordPeriod's same-membership race is
 * serialized by a single athlete/admin acting on their own membership, so no retry/lock machinery is
 * built here — see recordPeriod's javadoc for what happens if the index fires concurrently anyway.
 */
@Service
public class SubscriptionService {

    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;

    public SubscriptionService(SubscriptionRepository subscriptions, PlanRepository plans) {
        this.subscriptions = subscriptions;
        this.plans = plans;
    }

    /**
     * Create-or-extend for a payment period.
     * <p>
     * - Same plan already ACTIVE: extend {@code current_period_end} by the plan's {@code duration_days},
     *   measured from {@code max(now, currentEnd)} — a null (grandfathered) end is treated as needing a
     *   fresh start from now, same as a lapsed (past) end.
     * - Different plan already ACTIVE: 409 {@code SWITCH_REQUIRES_CANCEL}.
     * - No ACTIVE subscription: create a new one, now -> now + duration.
     * <p>
     * Concurrency: this method does a plain read-then-write under the row's normal transaction
     * isolation; it does not take an explicit lock. If two calls for the *same* membership somehow
     * raced (not expected — the caller is a single athlete or admin acting on one membership), the
     * partial unique index {@code uq_subscription_active} is the backstop: the second insert throws a
     * {@code DataIntegrityViolationException}, which is NOT caught here and propagates as a 500 to the
     * caller, not a clean 409. That's an acceptable ceiling for this task — Task 5/6's callers don't
     * fan out concurrent writes for one membership.
     */
    @Transactional
    public Subscription recordPeriod(UUID membershipId, UUID planId, int priceCents, String priceNote) {
        Plan plan = plans.findById(planId).orElseThrow();
        Optional<Subscription> activeOpt = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE");

        Subscription sub;
        Instant base;
        if (activeOpt.isPresent()) {
            Subscription active = activeOpt.get();
            if (!active.getPlanId().equals(planId)) {
                throw conflict("SWITCH_REQUIRES_CANCEL");
            }
            sub = active;
            Instant now = Instant.now();
            Instant currentEnd = active.getCurrentPeriodEnd();
            base = (currentEnd != null && currentEnd.isAfter(now)) ? currentEnd : now;
        } else {
            sub = new Subscription();
            sub.setMembershipId(membershipId);
            sub.setPlanId(planId);
            sub.setStatus("ACTIVE");
            base = Instant.now();
        }

        sub.setPriceCents(priceCents);
        sub.setPriceNote(priceNote);
        // Both ends of the period move together: currentPeriodStart is what a receipt renders as
        // "from", and it must be the paid-for period's actual start (= base), not the row's original
        // creation time — otherwise a renewal's receipt claims a term many periods longer than what
        // was actually paid for (e.g. a 6th monthly payment reading "12 Feb - 21 Aug").
        sub.setCurrentPeriodStart(base);
        sub.setCurrentPeriodEnd(base.plusSeconds(plan.getDurationDays() * 24L * 3600));
        return subscriptions.save(sub);
    }

    @Transactional
    public void cancel(UUID subscriptionId) {
        Subscription sub = subscriptions.findById(subscriptionId).orElseThrow();
        sub.setStatus("CANCELED");
        subscriptions.save(sub);
    }

    public Optional<Subscription> activeFor(UUID membershipId) {
        return subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE")
                .filter(s -> s.getCurrentPeriodEnd() == null || s.getCurrentPeriodEnd().isAfter(Instant.now()));
    }

    private ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
