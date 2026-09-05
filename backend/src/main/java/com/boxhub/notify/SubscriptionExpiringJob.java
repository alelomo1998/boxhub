package com.boxhub.notify;

import com.boxhub.box.*;
import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

/**
 * Nightly: warn every member whose subscription ends within EXPIRING_SOON_DAYS. Registry §4.3 —
 * before this, the only membership-ending mail was SubscriptionLapseJob's, sent after the fact.
 *
 * <p><b>The number is EXPIRING_SOON_DAYS and nothing else.</b> HomeController's athlete banner used
 * to hardcode 7 while this rule used 14; M29b Task 1 deleted that literal, so the banner, the staff
 * "expiring" segment, the members-table chip and this event now answer one question.
 *
 * <p><b>Tenancy.</b> Subscription is @TenantId and the sweep is inherently cross-box, so there is no
 * single JWT to run it under. Same fix as SubscriptionLapseJob: iterate boxes (Box carries no
 * @TenantId, so findAll() is safe) and install each box's tenant via runAsBox BEFORE opening the
 * transaction. Never runAsRoot — this INSERTs @TenantId rows.
 *
 * <p><b>Idempotence.</b> Running nightly for fourteen nights must warn a member once, which is what
 * NotificationType.SUBSCRIPTION_EXPIRING's dedupe key (subscription + period end) buys. A renewal
 * changes the period end and legitimately re-arms the warning.
 */
@Component
public class SubscriptionExpiringJob {

    private final BoxRepository boxes;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final NotificationService notifications;
    private final TransactionTemplate tx;

    public SubscriptionExpiringJob(BoxRepository boxes, SubscriptionRepository subscriptions,
                                   PlanRepository plans, NotificationService notifications,
                                   PlatformTransactionManager txManager) {
        this.boxes = boxes;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.notifications = notifications;
        this.tx = new TransactionTemplate(txManager);
    }

    /** Nightly, every box. Cron won't fire during short test runs — tests call sweepBox directly. */
    @Scheduled(cron = "0 15 4 * * *")
    public void sweepAll() {
        for (Box b : boxes.findAll()) {
            sweepBox(b.getId());
        }
    }

    void sweepBox(UUID boxId) {
        Instant cutoff = Instant.now().plus(SegmentResolver.EXPIRING_SOON_DAYS, ChronoUnit.DAYS);
        TenantContext.runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            for (Subscription sub : subscriptions.findByStatusAndCurrentPeriodEndBefore("ACTIVE", cutoff)) {
                // A grandfathered subscription has a null period end and is never expiring — the
                // SQL comparison is UNKNOWN, not TRUE, so it falls out of the WHERE clause for free
                // (the same reasoning SubscriptionLapseJob documents).
                Plan plan = plans.findById(sub.getPlanId()).orElse(null);
                notifications.emit(NotificationType.SUBSCRIPTION_EXPIRING, sub.getMembershipId(),
                        Map.of(NotificationType.SUBSCRIPTION_ID, sub.getId().toString(),
                               NotificationType.ENDS_AT, sub.getCurrentPeriodEnd().toString(),
                               NotificationType.PLAN_NAME, plan == null ? "" : plan.getName()));
            }
        }));
    }
}
