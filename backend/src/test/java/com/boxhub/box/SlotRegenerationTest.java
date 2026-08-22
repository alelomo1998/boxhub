package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SlotRegenerationTest extends AbstractIntegrationTest {

    @Autowired SlotRegenerationService regeneration;
    @Autowired ClassSessionRepository sessions;
    @Autowired BoxRepository boxes;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired BookingRepository bookingRepo;
    @Autowired BookingService bookingService;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private record Ctx(UUID boxId, UUID slotId, UUID pastSessionId, UUID futureSessionId) {}

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    // One box, one active slot, and two already-materialized sessions off that slot: one in the
    // past (must survive any "from now/soon" regeneration) and one in the future (the one tests
    // book onto). capacity=1 so a second booking onto futureSessionId genuinely waitlists.
    /**
     * THE DEFECT THIS TEST EXISTS FOR, pinned so it cannot hide behind the calendar again.
     *
     * <p>`regenerateFrom(slot, from)` deleted from `from` forward and then called the generator,
     * which restarted at TODAY — so every occurrence between today and `from` that did not already
     * exist was created BEFORE `from`. "Regenerate from Tuesday" also recreated Monday.
     *
     * <p>`regeneratesForwardAndLeavesEarlierSessionsAlone` above can catch this, but only on dates
     * where `from` happens to land later in the week than the slot's weekday: it passed on
     * 2026-08-20 and failed on CI on 2026-08-22 with no code change between them. This test pins
     * the slot's weekday to TOMORROW and `from` to today+3, so the gap exists on every calendar
     * date and the failure is deterministic.
     */
    @Test
    void regenerationNeverCreatesASessionBeforeTheDateItStartsFrom() {
        ZoneId tz = ZoneId.of("Europe/Rome");
        LocalDate today = LocalDate.now(tz);
        LocalDate tomorrow = today.plusDays(1);

        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Floor " + n);
        b.setSlug("floor-" + n);
        b.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);

        ClassType t = new ClassType();
        t.setName("WOD");
        UUID typeId = types.save(t).getId();

        ScheduleSlot slot = new ScheduleSlot();
        slot.setClassTypeId(typeId);
        // 0=Mon; DayOfWeek is 1=Mon, so subtract one. The slot runs TOMORROW, always before `from`.
        slot.setWeekday(tomorrow.getDayOfWeek().getValue() - 1);
        slot.setStartTime(LocalTime.of(6, 0));
        slot.setDurationMin(60);
        slot.setCapacity(1);
        UUID slotId = slots.save(slot).getId();

        LocalDate from = today.plusDays(3);
        regeneration.regenerateFrom(slotId, from);

        Instant fromInstant = from.atStartOfDay(tz).toInstant();
        List<Instant> before = sessions.findAll().stream()
                .filter(x -> slotId.equals(x.getScheduleSlotId()))
                .map(ClassSession::getStartAt)
                .filter(at -> at.isBefore(fromInstant))
                .sorted().toList();

        assertThat(before)
                .as("regenerateFrom(%s) must not create any session before %s, but created %s",
                        from, from, before)
                .isEmpty();
    }

    private Ctx seedSlotWithSessions() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Regen " + n);
        b.setSlug("regen-" + n);
        b.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(b).getId();
        actAsBox(boxId);

        ClassType t = new ClassType();
        t.setName("WOD");
        UUID typeId = types.save(t).getId();

        ScheduleSlot slot = new ScheduleSlot();
        slot.setClassTypeId(typeId);
        slot.setWeekday(0);
        slot.setStartTime(LocalTime.of(6, 0));
        slot.setDurationMin(60);
        slot.setCapacity(1);
        UUID slotId = slots.save(slot).getId();

        ClassSession past = new ClassSession();
        past.setScheduleSlotId(slotId);
        past.setName("WOD");
        past.setStartAt(Instant.now().minusSeconds(3600 * 24 * 2));
        past.setDurationMin(60);
        past.setCapacity(1);
        UUID pastSessionId = sessions.save(past).getId();

        ClassSession future = new ClassSession();
        future.setScheduleSlotId(slotId);
        future.setName("WOD");
        future.setStartAt(Instant.now().plusSeconds(3600 * 24 * 5));
        future.setDurationMin(60);
        future.setCapacity(1);
        UUID futureSessionId = sessions.save(future).getId();

        return new Ctx(boxId, slotId, pastSessionId, futureSessionId);
    }

    private UUID newEntitledMembership() {
        long n = System.nanoTime();
        User u = authService.register("regen-" + n + "-" + Math.random() + "@t.io", "correct-horse-battery", "Athlete");
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(com.boxhub.shared.TenantContext.requireBoxId()).orElseThrow());
        m.setRole("ATHLETE");
        UUID membershipId = memberships.save(m).getId();
        Plan p = new Plan();
        p.setName("Plan " + n);
        p.setDurationDays(30);
        p.setEntitlement("UNLIMITED");
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");
        return membershipId;
    }

    private Booking bookSomeoneOnto(UUID sessionId) {
        return bookingService.book(sessionId, newEntitledMembership());
    }

    private void cancelThatBooking(UUID sessionId) {
        Booking b = bookingRepo.findBySessionId(sessionId).stream()
                .filter(x -> !"CANCELLED".equals(x.getStatus()))
                .findFirst().orElseThrow();
        bookingService.cancel(sessionId, b.getMembershipId());
    }

    private void bookSomeoneOntoWithStatus(UUID sessionId, String status) {
        if ("WAITLIST".equals(status)) {
            bookSomeoneOnto(sessionId); // fills the capacity=1 session
            Booking waitlisted = bookSomeoneOnto(sessionId);
            assertThat(waitlisted.getStatus()).isEqualTo("WAITLIST");
            return;
        }
        Booking b = bookSomeoneOnto(sessionId);
        if ("CHECKED_IN".equals(status)) bookingService.checkIn(b.getId());
        else if ("NO_SHOW".equals(status)) bookingService.markNoShow(b.getId());
    }

    @Test
    void regeneratesForwardAndLeavesEarlierSessionsAlone() {
        var ctx = seedSlotWithSessions();
        var from = LocalDate.now().plusDays(3);
        var fromInstant = from.atStartOfDay(ZoneId.of("Europe/Rome")).toInstant();

        List<UUID> inRangeBefore = sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(ctx.slotId(), fromInstant)
                .stream().map(ClassSession::getId).sorted().toList();
        List<UUID> earlierBefore = sessions.findAll().stream()
                .filter(s -> ctx.slotId().equals(s.getScheduleSlotId()) && s.getStartAt().isBefore(fromInstant))
                .map(ClassSession::getId).sorted().toList();

        regeneration.regenerateFrom(ctx.slotId(), from);

        List<UUID> inRangeAfter = sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(ctx.slotId(), fromInstant)
                .stream().map(ClassSession::getId).sorted().toList();
        List<UUID> earlierAfter = sessions.findAll().stream()
                .filter(s -> ctx.slotId().equals(s.getScheduleSlotId()) && s.getStartAt().isBefore(fromInstant))
                .map(ClassSession::getId).sorted().toList();

        assertThat(inRangeAfter).isNotEqualTo(inRangeBefore); // the in-range session was actually replaced
        assertThat(earlierAfter).isEqualTo(earlierBefore);    // nothing before `from` moved
        assertThat(sessions.findById(ctx.pastSessionId())).isPresent();
    }

    @Test
    void refusesWhenARangeHoldsALiveBooking() {          // spec decision 11
        var ctx = seedSlotWithSessions();
        bookSomeoneOnto(ctx.futureSessionId());

        assertThatThrownBy(() -> regeneration.regenerateFrom(ctx.slotId(), LocalDate.now()))
                .hasMessageContaining("RANGE_HAS_BOOKINGS");
    }

    @Test
    void refusalIsTotal_nothingInTheRangeIsRegenerated() {
        var ctx = seedSlotWithSessions();
        bookSomeoneOnto(ctx.futureSessionId());
        var idsBefore = sessions.findAll().stream().map(ClassSession::getId).sorted().toList();

        try { regeneration.regenerateFrom(ctx.slotId(), LocalDate.now()); } catch (RuntimeException expected) { }

        var idsAfter = sessions.findAll().stream().map(ClassSession::getId).sorted().toList();
        assertThat(idsAfter).isEqualTo(idsBefore);
    }

    @Test
    void aCancelledBookingDoesNotBlock() {
        // where decisions 9 and 11 meet. If CANCELLED blocked, accumulated cancels would freeze a
        // slot permanently — invisible until a box has been running a month.
        var ctx = seedSlotWithSessions();
        bookSomeoneOnto(ctx.futureSessionId());
        cancelThatBooking(ctx.futureSessionId());

        regeneration.regenerateFrom(ctx.slotId(), LocalDate.now());   // does not throw
    }

    @Test
    void waitlistCheckedInAndNoShowAllBlock() {
        for (String status : new String[]{"WAITLIST", "CHECKED_IN", "NO_SHOW"}) {
            var ctx = seedSlotWithSessions();
            bookSomeoneOntoWithStatus(ctx.futureSessionId(), status);

            assertThatThrownBy(() -> regeneration.regenerateFrom(ctx.slotId(), LocalDate.now()))
                    .as("status %s must block regeneration", status)
                    .hasMessageContaining("RANGE_HAS_BOOKINGS");
        }
    }
}
