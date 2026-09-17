package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Home's habit suggestion (spec §2.5): propose the athlete's habitual slot when nothing's booked. */
class HomeSuggestionTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired BookingRepository bookings;

    Box boxA;
    String athlete;
    UUID athleteMembershipId, adminMembershipId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxA = newBox("Hab A " + n, "hab-a-" + n);
        actAsBox(boxA.getId());
        TokMem athleteTm = member("habx-" + n + "@t.io", boxA, "ATHLETE");
        athlete = athleteTm.token();
        athleteMembershipId = athleteTm.membershipId();
        adminMembershipId = member("haba-" + n + "@t.io", boxA, "BOX_ADMIN").membershipId();

        Plan p = new Plan();
        p.setName("Plan");
        p.setDurationDays(30);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(athleteMembershipId, planId, 0, "test");
        SecurityContextHolder.clearContext();
    }

    record TokMem(String token, UUID membershipId) {}

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String name, String slug) {
        Box x = new Box(); x.setName(name); x.setSlug(slug); x.setTimezone("Europe/Rome");
        return boxes.save(x);
    }

    private TokMem member(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        UUID mid = memberships.save(m).getId();
        return new TokMem(tokenService.boxToken(u, m), mid);
    }

    private UUID slot(int weekday, LocalTime at) {
        ClassType t = new ClassType();
        t.setName("Type " + weekday + "-" + at);
        types.save(t);
        ScheduleSlot sl = new ScheduleSlot();
        sl.setClassTypeId(t.getId());
        sl.setWeekday(weekday);
        sl.setStartTime(at);
        sl.setDurationMin(60);
        sl.setCapacity(10);
        slots.save(sl);
        return sl.getId();
    }

    private UUID session(UUID slotId, Instant startAt, int capacity) {
        ClassSession s = new ClassSession();
        s.setScheduleSlotId(slotId);
        s.setName("Class");
        s.setStartAt(startAt);
        s.setDurationMin(60);
        s.setCapacity(capacity);
        sessions.save(s);
        return s.getId();
    }

    private void booking(UUID sessionId, UUID membershipId, String status) {
        Booking b = new Booking();
        b.setSessionId(sessionId);
        b.setMembershipId(membershipId);
        b.setStatus(status);
        bookings.save(b);
    }

    private static Instant daysFromNow(long d) {
        return Instant.now().plus(Duration.ofDays(d)).truncatedTo(ChronoUnit.MICROS);
    }

    @Test
    void suggestsTheNextSessionOfTheSlotAttendedMost() throws Exception {
        actAsBox(boxA.getId());
        UUID slotM = slot(0, LocalTime.of(19, 0));
        UUID slotE = slot(2, LocalTime.of(6, 0));
        booking(session(slotM, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotM, daysFromNow(-14), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotM, daysFromNow(-21), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotE, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotE, daysFromNow(-14), 10), athleteMembershipId, "CHECKED_IN");
        UUID futureM = session(slotM, daysFromNow(2), 10);
        session(slotE, daysFromNow(1), 10);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion.sessionId").value(futureM.toString()));
    }

    @Test
    void noSuggestionWithoutHistory() throws Exception {
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion").doesNotExist());
    }

    @Test
    void oneVisitIsNotAHabit() throws Exception {
        actAsBox(boxA.getId());
        UUID slotM = slot(0, LocalTime.of(19, 0));
        booking(session(slotM, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        session(slotM, daysFromNow(2), 10);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion").doesNotExist());
    }

    @Test
    void bookedOrCancelledHandling() throws Exception {
        actAsBox(boxA.getId());
        UUID slotM = slot(0, LocalTime.of(19, 0));
        booking(session(slotM, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotM, daysFromNow(-14), 10), athleteMembershipId, "CHECKED_IN");
        UUID futureM = session(slotM, daysFromNow(2), 10);
        // Nothing booked yet on futureM, but a booking on an UNRELATED session already makes
        // nextBooking non-null — the card shows nothing booked, not that this particular slot
        // is free, so the suggestion must stay hidden even though futureM itself is eligible.
        UUID unrelatedSlot = slot(3, LocalTime.of(8, 0));
        UUID unrelatedSession = session(unrelatedSlot, daysFromNow(4), 10);
        Booking unrelatedBooking = new Booking();
        unrelatedBooking.setSessionId(unrelatedSession);
        unrelatedBooking.setMembershipId(athleteMembershipId);
        unrelatedBooking.setStatus("BOOKED");
        bookings.save(unrelatedBooking);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion").doesNotExist());

        actAsBox(boxA.getId());
        unrelatedBooking.setStatus("CANCELLED");
        bookings.save(unrelatedBooking);
        Booking myBooking = new Booking();
        myBooking.setSessionId(futureM);
        myBooking.setMembershipId(athleteMembershipId);
        myBooking.setStatus("BOOKED");
        bookings.save(myBooking);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion").doesNotExist());

        actAsBox(boxA.getId());
        myBooking.setStatus("CANCELLED");
        bookings.save(myBooking);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion.sessionId").value(futureM.toString()));
    }

    @Test
    void aFullSessionIsSkippedForTheNextOne() throws Exception {
        actAsBox(boxA.getId());
        UUID slotM = slot(0, LocalTime.of(19, 0));
        booking(session(slotM, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotM, daysFromNow(-14), 10), athleteMembershipId, "CHECKED_IN");
        UUID fullSession = session(slotM, daysFromNow(1), 1);
        booking(fullSession, adminMembershipId, "BOOKED");
        UUID openSession = session(slotM, daysFromNow(6), 10);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion.sessionId").value(openSession.toString()));
    }

    @Test
    void fallsBackToTheNextHabitTier() throws Exception {
        actAsBox(boxA.getId());
        UUID slotM = slot(0, LocalTime.of(19, 0));
        UUID slotE = slot(2, LocalTime.of(6, 0));
        booking(session(slotM, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotM, daysFromNow(-14), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotM, daysFromNow(-21), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotE, daysFromNow(-7), 10), athleteMembershipId, "CHECKED_IN");
        booking(session(slotE, daysFromNow(-14), 10), athleteMembershipId, "CHECKED_IN");
        UUID futureE = session(slotE, daysFromNow(3), 10);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion.sessionId").value(futureE.toString()));
    }

    @Test
    void bookedButNotCheckedInDoesNotBuildAHabit() throws Exception {
        actAsBox(boxA.getId());
        UUID slotM = slot(0, LocalTime.of(19, 0));
        booking(session(slotM, daysFromNow(-7), 10), athleteMembershipId, "BOOKED");
        booking(session(slotM, daysFromNow(-14), 10), athleteMembershipId, "BOOKED");
        booking(session(slotM, daysFromNow(-21), 10), athleteMembershipId, "BOOKED");
        session(slotM, daysFromNow(2), 10);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion").doesNotExist());
    }

    @Test
    void anotherBoxsHistoryNeverSuggests() throws Exception {
        long n = System.nanoTime();
        Box boxB = newBox("Hab B " + n, "hab-b-" + n);
        actAsBox(boxB.getId());
        TokMem otherAthlete = member("habo-" + n + "@t.io", boxB, "ATHLETE");
        Plan p = new Plan();
        p.setName("Plan B");
        p.setDurationDays(30);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(otherAthlete.membershipId(), planId, 0, "test");

        UUID slotB = slot(0, LocalTime.of(19, 0));
        booking(session(slotB, daysFromNow(-7), 10), otherAthlete.membershipId(), "CHECKED_IN");
        booking(session(slotB, daysFromNow(-14), 10), otherAthlete.membershipId(), "CHECKED_IN");
        UUID futureB = session(slotB, daysFromNow(2), 10);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion").doesNotExist());

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + otherAthlete.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestion.sessionId").value(futureB.toString()));
    }
}
