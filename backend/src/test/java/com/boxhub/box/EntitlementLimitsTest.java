package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * M16a spec §5.1: the seven tests the entitlement model exists for. AND composition across periods,
 * refunds, cancellation limits, period rollover, subscription-term scoping, and — the whole
 * justification for the ledger — that SlotRegenerationService deleting CANCELLED booking rows does
 * NOT alter consumed counts.
 * <p>
 * Every session instant is built from a pinned Monday in Europe/Rome, never from
 * {@code Instant.now().plusSeconds(...)} — a calendar test that is green most days is a coin flip.
 */
class EntitlementLimitsTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired BookingService bookingService;
    @Autowired BookingRepository bookings;
    @Autowired SlotRegenerationService regeneration;
    @Autowired EntitlementLedger ledger;

    private static final ZoneId ROME = ZoneId.of("Europe/Rome");
    // A Monday, far enough ahead that no test is racing the cancel cutoff. Pinned, not derived from
    // now(): a week/month boundary test that only holds on some days of some months is a coin flip.
    private static final LocalDate MONDAY = LocalDate.of(2027, 3, 1); // 2027-03-01 is a Monday
    private static Instant at(LocalDate d, int hour) { return d.atStartOfDay(ROME).plusHours(hour).toInstant(); }

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID newBox(String slug) { return newBox(slug, b -> { }); }

    private UUID newBox(String slug, Consumer<Box> configure) {
        Box b = new Box();
        b.setName("Entitlement " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        configure.accept(b);
        return boxes.save(b).getId();
    }

    private UUID newMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("lim-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private UUID newSession(Instant startAt) { return newSession(startAt, 5); }

    private UUID newSession(Instant startAt, int capacity) {
        ClassSession s = new ClassSession();
        s.setName("WOD");
        s.setStartAt(startAt);
        s.setDurationMin(60);
        s.setCapacity(capacity);
        return sessions.save(s).getId();
    }

    private UUID newPlan(Consumer<Plan> configure) {
        Plan p = new Plan();
        p.setName("Plan " + System.nanoTime());
        p.setDurationDays(30);
        configure.accept(p);
        return plans.save(p).getId();
    }

    private void assertConflict(ResponseStatusException ex, String reason) {
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ex.getReason()).isEqualTo(reason);
    }

    /**
     * THE test the ledger exists for. SlotRegenerationService.regenerateFrom refuses a range holding
     * a live (BOOKED/WAITLIST/CHECKED_IN/NO_SHOW) booking and only ever deletes CANCELLED rows — so
     * this is built on a CANCELLED booking, the one case regeneration can actually touch. A box that
     * counts waitlist cancellations, a plan capped at one cancellation per week: an athlete joins a
     * full session's waitlist (a filler membership occupies the one seat first) and cancels, leaving
     * one CANCELLATION ledger row and a deletable CANCELLED booking row. regenerateFrom deletes that
     * booking (and the filler's, once it too is cancelled so the range holds nothing live) — but the
     * ledger row survives, so a second cancellation in the same week is still blocked.
     * <p>
     * Negative control: make EntitlementLedger.firstViolated count from BookingRepository.countInWeek
     * instead of entitlement_usage and this test goes red.
     */
    @Test
    void regeneratingASlotDoesNotAlterConsumedCounts() {
        UUID boxId = newBox("regen-ledger-" + System.nanoTime(), b -> b.setCountWaitlistCancellations(true));
        actAsBox(boxId);
        UUID planId = newPlan(p -> p.setCancellationsPerWeek(1));
        UUID membershipId = newMembership(boxId);
        UUID fillerId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");
        subscriptionService.recordPeriod(fillerId, planId, 0, "test");

        ClassType type = new ClassType();
        type.setName("WOD");
        UUID typeId = types.save(type).getId();

        ScheduleSlot slot = new ScheduleSlot();
        slot.setClassTypeId(typeId);
        slot.setWeekday(0); // Monday, matches MONDAY
        slot.setStartTime(LocalTime.of(10, 0));
        slot.setDurationMin(60);
        slot.setCapacity(1);
        UUID slotId = slots.save(slot).getId();

        ClassSession session = new ClassSession();
        session.setScheduleSlotId(slotId);
        session.setName("WOD");
        session.setStartAt(at(MONDAY, 10));
        session.setDurationMin(60);
        session.setCapacity(1);
        UUID sessionId = sessions.save(session).getId();

        bookingService.book(sessionId, fillerId); // fills the one seat -> BOOKED
        Booking waitlisted = bookingService.book(sessionId, membershipId);
        assertThat(waitlisted.getStatus()).isEqualTo("WAITLIST");

        bookingService.cancel(sessionId, membershipId); // -> CANCELLED, 1 CANCELLATION ledger row
        bookingService.cancel(sessionId, fillerId);      // range now holds nothing live

        assertThat(bookings.findById(waitlisted.getId()).orElseThrow().getStatus()).isEqualTo("CANCELLED");

        regeneration.regenerateFrom(slotId, MONDAY.minusDays(1));

        assertThat(bookings.findById(waitlisted.getId())).isEmpty(); // the CANCELLED row was deleted

        UUID freshSessionId = newSession(at(MONDAY, 18)); // unrelated to the slot
        Booking again = bookingService.book(freshSessionId, membershipId);
        assertThat(again.getStatus()).isEqualTo("BOOKED");
        assertThatThrownBy(() -> bookingService.cancel(freshSessionId, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "CANCEL_LIMIT_REACHED"));
    }

    @Test
    void entriesPerDayAndPerWeekBothBind_theFourthInADayIsBlockedWhileTheWeekHasRoom() {
        UUID boxId = newBox("day-week-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(p -> { p.setEntriesPerDay(3); p.setEntriesPerWeek(10); });
        UUID membershipId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        bookingService.book(newSession(at(MONDAY, 6)), membershipId);
        bookingService.book(newSession(at(MONDAY, 7)), membershipId);
        bookingService.book(newSession(at(MONDAY, 8)), membershipId);

        UUID fourthSessionId = newSession(at(MONDAY, 9));
        assertThatThrownBy(() -> bookingService.book(fourthSessionId, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "LIMIT_REACHED"));

        Plan plan = plans.findById(planId).orElseThrow();
        Subscription sub = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE").orElseThrow();
        assertThat(ledger.firstViolated(PlanLimits.ENTRY_RULES, plan, sub, at(MONDAY, 9), ROME, membershipId))
                .isEqualTo("ENTRIES_PER_DAY");

        Booking tuesday = bookingService.book(newSession(at(MONDAY.plusDays(1), 6)), membershipId);
        assertThat(tuesday.getStatus()).isEqualTo("BOOKED"); // the week still has room; only the day was full
    }

    @Test
    void entriesPerWeekBindsOnADayThatIsCompletelyEmpty() {
        UUID boxId = newBox("week-empty-day-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(p -> { p.setEntriesPerDay(3); p.setEntriesPerWeek(10); });
        UUID membershipId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        int[] perDay = {3, 3, 3, 1}; // Mon, Tue, Wed, Thu -> 10 total, day limit (3) never exceeded
        for (int day = 0; day < perDay.length; day++) {
            for (int i = 0; i < perDay[day]; i++) {
                Booking b = bookingService.book(newSession(at(MONDAY.plusDays(day), 6 + i)), membershipId);
                assertThat(b.getStatus()).isEqualTo("BOOKED");
            }
        }

        // Friday holds nothing, so this can only be the weekly rule.
        UUID fridaySessionId = newSession(at(MONDAY.plusDays(4), 6));
        assertThatThrownBy(() -> bookingService.book(fridaySessionId, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "LIMIT_REACHED"));

        Plan plan = plans.findById(planId).orElseThrow();
        Subscription sub = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE").orElseThrow();
        assertThat(ledger.firstViolated(PlanLimits.ENTRY_RULES, plan, sub, at(MONDAY.plusDays(4), 6), ROME, membershipId))
                .isEqualTo("ENTRIES_PER_WEEK");
    }

    @Test
    void anInTimeCancellationGivesTheEntryBackAndTheAthleteCanBookAgain() {
        UUID boxId = newBox("intime-cancel-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(p -> p.setEntriesPerWeek(1));
        UUID membershipId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        UUID sessionId = newSession(at(MONDAY, 10));
        Booking booked = bookingService.book(sessionId, membershipId);
        assertThat(booked.getStatus()).isEqualTo("BOOKED");

        bookingService.cancel(sessionId, membershipId); // well before the cutoff -> not late

        Booking again = bookingService.book(newSession(at(MONDAY, 18)), membershipId);
        assertThat(again.getStatus()).isEqualTo("BOOKED"); // the refunded ENTRY stopped counting
    }

    @Test
    void aLateCancellationOnABoxThatAllowsThemBurnsTheEntry() {
        UUID boxId = newBox("late-cancel-burns-" + System.nanoTime(), b -> {
            b.setAllowLateCancel(true);
            b.setLateCancelRefundsEntry(false);
            // Deliberately huge: forces `late` true for the pinned MONDAY anchor regardless of which
            // real calendar day the suite happens to run on (MONDAY is ~7 months out from any run
            // date this fixture is valid for, and a normal cutoff would never reach that far back).
            b.setCancelCutoffMin(Integer.MAX_VALUE);
        });
        actAsBox(boxId);
        UUID planId = newPlan(p -> p.setEntriesPerWeek(1));
        UUID membershipId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        UUID sessionId = newSession(at(MONDAY, 10));
        Booking booked = bookingService.book(sessionId, membershipId);
        assertThat(booked.getStatus()).isEqualTo("BOOKED");

        bookingService.cancel(sessionId, membershipId); // late, but the box allows it -> succeeds

        // This is the case spec §2.4 describes and that the pre-M16a engine could not reach at all:
        // PAST_CUTOFF blocked every late cancel of a BOOKED row, so was_late was only ever true on a
        // waitlist cancel (BookingCancellationTest:182). The flag is what makes the rule reachable.
        UUID nextSessionId = newSession(at(MONDAY, 18));
        assertThatThrownBy(() -> bookingService.book(nextSessionId, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "LIMIT_REACHED"));
    }

    @Test
    void aCancellationLimitBindsEvenWhenEntriesHaveRoom() {
        UUID boxId = newBox("cancel-limit-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(p -> p.setCancellationsPerWeek(1)); // every entry limit stays NULL
        UUID membershipId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        UUID session1 = newSession(at(MONDAY, 8));
        UUID session2 = newSession(at(MONDAY, 9));
        bookingService.book(session1, membershipId);
        bookingService.book(session2, membershipId);

        bookingService.cancel(session1, membershipId); // fine, first cancellation this week

        assertThatThrownBy(() -> bookingService.cancel(session2, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "CANCEL_LIMIT_REACHED"));
        // Entries were unlimited throughout, so only the cancellation rule can have fired.
    }

    @Test
    void lastWeeksBookingDoesNotCountAgainstThisWeek() {
        UUID boxId = newBox("last-week-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(p -> p.setEntriesPerWeek(1));
        UUID membershipId = newMembership(boxId);
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        // MONDAY.minusWeeks(1) is still comfortably in the future relative to any run date this
        // fixture is valid for (MONDAY is pinned ~7 months out), so book() never hits its PAST guard.
        Booking lastWeek = bookingService.book(newSession(at(MONDAY.minusWeeks(1), 10)), membershipId);
        assertThat(lastWeek.getStatus()).isEqualTo("BOOKED");

        Booking thisWeek = bookingService.book(newSession(at(MONDAY, 10)), membershipId);
        assertThat(thisWeek.getStatus()).isEqualTo("BOOKED"); // windows anchor to the session, not now()

        // Same week as thisWeek's own session (Monday-Sunday containing MONDAY): a third session
        // still inside that week must be blocked. This is what actually proves the window is
        // anchored to the session being booked rather than to real now() — if it weren't, last
        // week's booking wouldn't have leaked in, but this week's own cap wouldn't be enforced
        // either, and this assertion is the one that would silently pass either way otherwise.
        UUID thirdSessionId = newSession(at(MONDAY, 18));
        assertThatThrownBy(() -> bookingService.book(thirdSessionId, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "LIMIT_REACHED"));
    }

    @Test
    void entriesTotalIsScopedToTheSubscriptionTermAndDoesNotResetMidWindow() {
        UUID boxId = newBox("term-scoped-" + System.nanoTime());
        actAsBox(boxId);
        UUID planId = newPlan(p -> { p.setEntriesTotal(2); p.setDurationDays(30); });
        UUID membershipId = newMembership(boxId);

        // Direct construction, not recordPeriod(): recordPeriod bases a fresh term on real now(), and
        // this fixture needs the term to cover the pinned MONDAY anchor instead. The renewal below
        // still goes through the real recordPeriod() machinery, extending from THIS period's own end.
        Subscription sub = new Subscription();
        sub.setMembershipId(membershipId);
        sub.setPlanId(planId);
        sub.setStatus("ACTIVE");
        sub.setPriceCents(0);
        sub.setCurrentPeriodStart(at(MONDAY.minusDays(5), 0));
        sub.setCurrentPeriodEnd(at(MONDAY.plusDays(25), 0));
        subscriptions.save(sub);

        bookingService.book(newSession(at(MONDAY, 8)), membershipId);
        bookingService.book(newSession(at(MONDAY, 9)), membershipId);

        UUID thirdSessionId = newSession(at(MONDAY, 10));
        assertThatThrownBy(() -> bookingService.book(thirdSessionId, membershipId))
                .isInstanceOfSatisfying(ResponseStatusException.class, ex -> assertConflict(ex, "LIMIT_REACHED"));

        Plan plan = plans.findById(planId).orElseThrow();
        Subscription active = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE").orElseThrow();
        assertThat(ledger.firstViolated(PlanLimits.ENTRY_RULES, plan, active, at(MONDAY, 10), ROME, membershipId))
                .isEqualTo("ENTRIES_TOTAL");

        // Renewal: currentPeriodEnd is far in the future (MONDAY+25d), so recordPeriod's
        // base = currentEnd branch fires and the term moves forward from there, not from real now().
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");

        Booking newTerm = bookingService.book(newSession(at(MONDAY.plusDays(26), 10)), membershipId);
        assertThat(newTerm.getStatus()).isEqualTo("BOOKED"); // the old term's two rows fall outside the new window
    }
}
