package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.Brand;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.TenantContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Nightly sweep: ACTIVE subscriptions whose current_period_end has passed flip to EXPIRED and get
 * the subscription-lapsed mail. Grandfathered (null end) and already-EXPIRED rows are untouched —
 * {@code current_period_end < :cutoff} is never true for a null end (SQL NULL comparisons are
 * UNKNOWN, not TRUE), and the {@code status = 'ACTIVE'} predicate already excludes EXPIRED rows,
 * so both exclusions fall out of the existing WHERE clause for free.
 * <p>
 * <b>Tenancy.</b> Subscription is {@code @TenantId}. {@link SubscriptionRepository#findByStatusAndCurrentPeriodEndBefore}
 * is a plain derived query, so with no ambient tenant it silently filters to the NO_TENANT
 * sentinel and returns nothing — the exact trap documented on {@code StripeWebhookController} and
 * in CLAUDE.md. The sweep is inherently cross-box, so there is no single JWT to run the whole
 * thing under. Chosen fix, mirroring {@code SessionGenerator.generateAll()}: iterate every
 * {@link Box} (Box carries no {@code @TenantId}, so {@code boxes.findAll()} is safe
 * tenant-agnostically) and, per box, install a synthetic box-scoped Authentication via
 * {@code runAsBox} BEFORE opening the transaction/Hibernate session (the same load-bearing
 * ordering {@code SessionGenerator}/{@code StripeWebhookController} document — setting the tenant
 * on an already-open session is a no-op), then run the ALREADY-correct, already-committed T3
 * query under that box's real tenant. This reuses the existing interface method instead of adding
 * a parallel native cross-box SELECT (the other option named in the M10 plan) — the "iterate boxes
 * under runAsBox" alternative it explicitly allows. The flip ({@code subscriptions.save}) happens
 * inside the same runAsBox+tx nesting as the read, so the {@code @TenantId box_id} write path
 * (auto-populated on insert/update from the resolved tenant) is exercised correctly for the
 * existing row's own box, not the sentinel. Mail is sent per box, strictly after that box's
 * transaction commits — never from inside it (house rule).
 */
@Component
public class SubscriptionLapseJob {

    private final BoxRepository boxes;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final MembershipRepository memberships;
    private final Mailer mailer;
    private final TransactionTemplate tx;

    public SubscriptionLapseJob(BoxRepository boxes, SubscriptionRepository subscriptions, PlanRepository plans,
                                 MembershipRepository memberships, Mailer mailer, PlatformTransactionManager txManager) {
        this.boxes = boxes;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.memberships = memberships;
        this.mailer = mailer;
        this.tx = new TransactionTemplate(txManager);
    }

    private record LapsedRow(Subscription subscription, Plan plan) {}

    /** Nightly, every box. Cron won't fire during short test runs — tests call sweepAll() directly. */
    @Scheduled(cron = "0 30 3 * * *")
    public void sweepAll() {
        for (Box b : boxes.findAll()) {
            sweepBox(b.getId());
        }
    }

    /** One box: flip its due subscriptions inside a tx under that box's tenant, then mail after commit. */
    void sweepBox(UUID boxId) {
        List<LapsedRow> lapsed = TenantContext.runAsBox(boxId, () -> tx.execute(status -> {
            List<LapsedRow> rows = new ArrayList<>();
            for (Subscription sub : subscriptions.findByStatusAndCurrentPeriodEndBefore("ACTIVE", Instant.now())) {
                sub.setStatus("EXPIRED");
                subscriptions.save(sub);
                rows.add(new LapsedRow(sub, plans.findById(sub.getPlanId()).orElse(null)));
            }
            return rows;
        }));

        for (LapsedRow row : lapsed) {
            sendLapseMail(row.subscription(), row.plan());
        }
    }

    private void sendLapseMail(Subscription sub, Plan plan) {
        Membership member = memberships.findByIdWithUser(sub.getMembershipId()).orElse(null);
        if (member == null) return;
        Map<String, Object> vars = new HashMap<>();
        vars.put("name", member.getUser().getName());
        vars.put("planName", plan == null ? "" : plan.getName());
        vars.put("link", mailer.link("/membership"));
        mailer.send(member.getUser().getEmail(), "Your " + Brand.NAME + " membership has lapsed", "subscription-lapsed", vars);
    }
}
