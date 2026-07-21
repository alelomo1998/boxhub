package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Membership <-> plan subscriptions: admin-recorded (cash/transfer/card/other) payments, athlete
 * Stripe checkout, and "what's my own status" for the athlete membership screen.
 */
@RestController
@RequestMapping("/api/box")
public class SubscriptionController {

    // STRIPE is deliberately excluded — that rail is checkout(), never admin-recorded.
    private static final Set<String> ADMIN_METHODS = Set.of("CASH", "TRANSFER", "CARD", "OTHER");

    private final SubscriptionTx tx;
    private final SubscriptionService subscriptionService;
    private final StripeCheckoutService checkoutService;
    private final PaymentReceipts receipts;
    private final MembershipRepository memberships;
    private final PlanRepository plans;
    private final BoxStripeRepository boxStripe;

    public SubscriptionController(SubscriptionTx tx, SubscriptionService subscriptionService,
                                   StripeCheckoutService checkoutService, PaymentReceipts receipts,
                                   MembershipRepository memberships, PlanRepository plans,
                                   BoxStripeRepository boxStripe) {
        this.tx = tx;
        this.subscriptionService = subscriptionService;
        this.checkoutService = checkoutService;
        this.receipts = receipts;
        this.memberships = memberships;
        this.plans = plans;
        this.boxStripe = boxStripe;
    }

    record RecordPaymentRequest(UUID membershipId, UUID planId, String method, int priceCents,
                                 String priceNote, String reference) {}

    // paymentId is only populated where a SubscriptionDto is built directly from the payment that
    // just created/extended it (record(), below) — null on GET /api/box/me/subscription, which
    // reports the current period, not any one payment.
    record SubscriptionDto(UUID id, UUID membershipId, UUID planId, String status, int priceCents,
                            String priceNote, Instant currentPeriodStart, Instant currentPeriodEnd,
                            UUID paymentId) {
        static SubscriptionDto of(Subscription s) {
            return of(s, null);
        }
        static SubscriptionDto of(Subscription s, UUID paymentId) {
            return new SubscriptionDto(s.getId(), s.getMembershipId(), s.getPlanId(), s.getStatus(),
                    s.getPriceCents(), s.getPriceNote(), s.getCurrentPeriodStart(), s.getCurrentPeriodEnd(),
                    paymentId);
        }
    }

    /** Box admin records an in-person/manual payment at whatever price was actually agreed
     *  (may be below the plan's list price — a negotiated discount, not an error). */
    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.CREATED)
    public SubscriptionDto record(@RequestBody RecordPaymentRequest req) {
        RoleGuard.requireBoxAdmin();
        UUID boxId = TenantContext.requireBoxId();
        if (req.method() == null || !ADMIN_METHODS.contains(req.method()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_METHOD");
        if (req.priceCents() < 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_PRICE");
        if (req.membershipId() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_MEMBERSHIP");
        if (req.planId() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_PLAN");

        // Cross-tenant guard: a foreign membership id must look absent, same convention as
        // MemberController#patch — findByIdAndBoxId is the tenant-scoping check.
        memberships.findByIdAndBoxId(req.membershipId(), boxId).orElseThrow(NoSuchElementException::new);
        Membership admin = memberships.findByUserIdAndBoxId(TenantContext.userId(), boxId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "NO_MEMBERSHIP"));

        SubscriptionTx.Recorded r = tx.recordAdminPayment(req.membershipId(), req.planId(), req.method(),
                req.priceCents(), req.priceNote(), req.reference(), admin.getId());

        receipts.sendReceipt(r.payment(), r.subscription(), r.plan());
        return SubscriptionDto.of(r.subscription(), r.payment().getId());
    }

    /** Frees the active slot so a different plan can be recorded — the only way to make good on
     *  the "cancel your current plan before switching" message both rails throw SWITCH_REQUIRES_CANCEL
     *  with. SubscriptionService.cancel's findById is tenant-scoped (Subscription is @TenantId), so a
     *  foreign-box id looks absent — 404, not 403, same convention as MemberController#patch. */
    @DeleteMapping("/subscriptions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID id) {
        RoleGuard.requireBoxAdmin();
        subscriptionService.cancel(id);
    }

    record CheckoutRequest(UUID planId) {}
    record CheckoutResponse(String url) {}

    /** Athlete (or any box member) starts a Stripe Checkout session for their OWN membership,
     *  resolved from the JWT — never a param. */
    @PostMapping("/subscriptions/checkout")
    public CheckoutResponse checkout(@RequestBody CheckoutRequest req) {
        UUID boxId = TenantContext.requireBoxId();
        if (!stripeAvailable(boxId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "STRIPE_NOT_CONNECTED");
        Membership caller = callerMembership(boxId);
        String url = checkoutService.createSession(caller.getId(), req.planId());
        return new CheckoutResponse(url);
    }

    record PlanSummaryDto(UUID id, String name, int priceCents, String currency, String entitlement,
                           Integer weeklyClassLimit, int durationDays) {
        static PlanSummaryDto of(Plan p) {
            return new PlanSummaryDto(p.getId(), p.getName(), p.getPriceCents(), p.getCurrency(),
                    p.getEntitlement(), p.getWeeklyClassLimit(), p.getDurationDays());
        }
    }

    record MySubscriptionDto(boolean stripeAvailable, SubscriptionDto subscription, PlanSummaryDto plan) {}

    /** The caller's own active subscription + plan, or null fields if they have none. Carries
     *  stripeAvailable so the athlete membership screen can gate the Subscribe button — an
     *  ATHLETE can't call the admin-only GET /api/box/stripe to find that out itself. */
    @GetMapping("/me/subscription")
    public MySubscriptionDto mySubscription() {
        UUID boxId = TenantContext.requireBoxId();
        Membership caller = callerMembership(boxId);
        Optional<Subscription> active = subscriptionService.activeFor(caller.getId());
        SubscriptionDto subDto = active.map(SubscriptionDto::of).orElse(null);
        PlanSummaryDto planDto = active.flatMap(s -> plans.findById(s.getPlanId()))
                .map(PlanSummaryDto::of).orElse(null);
        return new MySubscriptionDto(stripeAvailable(boxId), subDto, planDto);
    }

    private boolean stripeAvailable(UUID boxId) {
        return boxStripe.findByBoxId(boxId).filter(BoxStripe::isEnabled).isPresent();
    }

    private Membership callerMembership(UUID boxId) {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), boxId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "NO_MEMBERSHIP"));
    }
}
