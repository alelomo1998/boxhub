package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Home aggregate + announcement + session detail + admin KPIs. */
class HomeSurfaceApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired BookingRepository bookings;
    @Autowired AnnouncementService announcementService;
    @Autowired ObjectMapper om;

    String admin, coach, athlete, otherAthlete;
    UUID sessionId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Hm A " + n, "hm-a-" + n);
        Box b = newBox("Hm B " + n, "hm-b-" + n);
        admin = member("hma-" + n + "@t.io", a, "BOX_ADMIN").token();
        coach = member("hmc-" + n + "@t.io", a, "COACH").token();
        TokMem athleteTm = member("hmx-" + n + "@t.io", a, "ATHLETE");
        athlete = athleteTm.token();
        otherAthlete = member("hmo-" + n + "@t.io", b, "ATHLETE").token();

        actAsBox(a.getId());
        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(7200));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        sessionId = s.getId();
        // M10 T4: booking now requires an active subscription.
        Plan p = new Plan();
        p.setName("Plan");
        p.setDurationDays(30);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(athleteTm.membershipId(), planId, 0, "test");
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

    /** Like actAsBox, but with a real user id in the JWT subject — sent_by has a users FK. */
    private void actAsUser(UUID userId, UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(userId.toString())
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

    @Test
    void homeAggregateShowsNextBookingAfterBooking() throws Exception {
        // empty home first
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextBooking").doesNotExist())
                .andExpect(jsonPath("$.stats.checkinsThisWeek").isNumber());
        // book the session
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(jsonPath("$.nextBooking.className").value("WOD Class"))
                .andExpect(jsonPath("$.nextBooking.bookedCount").value(1));
    }

    @Test
    void sessionDetailShowsGridAndIsMemberVisible() throws Exception {
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book").header("Authorization", "Bearer " + athlete));
        mvc.perform(get("/api/box/sessions/" + sessionId + "/detail").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("WOD Class"))
                .andExpect(jsonPath("$.active.length()").value(1))
                .andExpect(jsonPath("$.active[0].name").isNotEmpty())
                .andExpect(jsonPath("$.queue.length()").value(0));
        // cross-tenant
        mvc.perform(get("/api/box/sessions/" + sessionId + "/detail").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminStatsForAdminOnly() throws Exception {
        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeMembers").isNumber())
                .andExpect(jsonPath("$.weekAttendance.fillPct").isNumber());
        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    /**
     * Regression for the AdminStatsController#stats() leak: activeMembers used to come from
     * MembershipRepository#findAll(), which is not box-scoped (Membership carries no @TenantId
     * discriminator). Two boxes with different, distinguishable ACTIVE counts (2 and 3) — a sum
     * (5), the other box's count (3), or a max would all be wrong and visibly different from the
     * right answer (2).
     */
    @Test
    void adminStatsActiveMembersScopedToCallersBoxNotSummedAcrossBoxes() throws Exception {
        long n = System.nanoTime();
        Box boxX = newBox("Stat X " + n, "stat-x-" + n);
        Box boxY = newBox("Stat Y " + n, "stat-y-" + n);

        String adminX = member("stx-" + n + "@t.io", boxX, "BOX_ADMIN").token();
        member("stx2-" + n + "@t.io", boxX, "ATHLETE");
        // boxX: 2 ACTIVE memberships (adminX + one athlete)

        member("sty-" + n + "@t.io", boxY, "BOX_ADMIN");
        member("sty2-" + n + "@t.io", boxY, "ATHLETE");
        member("sty3-" + n + "@t.io", boxY, "ATHLETE");
        // boxY: 3 ACTIVE memberships

        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + adminX))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeMembers").value(2));
    }

    /**
     * M10: planExpiringSoon/planDaysLeft/expiringPlans all now read the active Subscription's
     * currentPeriodEnd (nothing writes the old Membership.expiresAt column any more) — pin all
     * three surfaces against a real subscription end rather than the dead field.
     */
    @Test
    void planExpirySurfacesReadTheActiveSubscriptionNotTheDeadExpiresAtColumn() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("Exp " + n, "exp-" + n);
        String boxAdmin = member("expa-" + n + "@t.io", box, "BOX_ADMIN").token();
        TokMem soonTm = member("exps-" + n + "@t.io", box, "ATHLETE");
        TokMem farTm = member("expf-" + n + "@t.io", box, "ATHLETE");

        actAsBox(box.getId());
        Plan soonPlan = new Plan();
        soonPlan.setName("Soon " + n);
        soonPlan.setDurationDays(5); // inside both HomeController's EXPIRING_SOON_DAYS (14) and AdminStats' 15-day windows
        UUID soonPlanId = plans.save(soonPlan).getId();
        subscriptionService.recordPeriod(soonTm.membershipId(), soonPlanId, 0, "test");

        Plan farPlan = new Plan();
        farPlan.setName("Far " + n);
        farPlan.setDurationDays(60);
        UUID farPlanId = plans.save(farPlan).getId();
        subscriptionService.recordPeriod(farTm.membershipId(), farPlanId, 0, "test");
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + soonTm.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planExpiringSoon").value(true))
                .andExpect(jsonPath("$.stats.planDaysLeft").value(org.hamcrest.Matchers.lessThanOrEqualTo(5)));

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + farTm.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planExpiringSoon").value(false));

        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + boxAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiringPlans").value(1)); // only the 5-day plan counts
    }

    /**
     * M29b (D-12): the athlete banner's window must be SegmentResolver.EXPIRING_SOON_DAYS (14), the
     * same number the staff-facing "expiring" segment and the members table use — a 10-day plan is
     * inside 14 days but outside a stale 7-day literal.
     */
    @Test
    void aMembershipExpiringInTenDaysIsExpiringSoon() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("Exp10 " + n, "exp10-" + n);
        TokMem tm = member("exp10-" + n + "@t.io", box, "ATHLETE");

        actAsBox(box.getId());
        Plan plan = new Plan();
        plan.setName("Ten " + n);
        plan.setDurationDays(10);
        UUID planId = plans.save(plan).getId();
        subscriptionService.recordPeriod(tm.membershipId(), planId, 0, "test");
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + tm.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planExpiringSoon").value(true));
    }

    @Test
    void aMembershipExpiringInTwentyDaysIsNotExpiringSoon() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("Exp20 " + n, "exp20-" + n);
        TokMem tm = member("exp20-" + n + "@t.io", box, "ATHLETE");

        actAsBox(box.getId());
        Plan plan = new Plan();
        plan.setName("Twenty " + n);
        plan.setDurationDays(20);
        UUID planId = plans.save(plan).getId();
        subscriptionService.recordPeriod(tm.membershipId(), planId, 0, "test");
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + tm.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planExpiringSoon").value(false));
    }

    /**
     * M29a (D-4): the home card now reads through announcement_recipient, so it is audience-scoped.
     * Send an announcement to a CLASS_ROSTER containing athlete A (booked into the session) and not
     * athlete B (never booked) — A sees it, B's $.announcement must not exist.
     *
     * Negative control (verified, not left in the suite): reverting HomeController's home() to
     * `announcements.findAll().stream().findFirst()` makes this test fail:
     * java.lang.AssertionError: Expected no value at JSON path "$.announcement" but found:
     * {body=Roster only, updatedAt=...}
     */
    @Test
    void homeShowsOnlyAnAnnouncementAddressedToMe() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("Ann " + n, "ann-" + n);
        TokMem athleteA = member("anna-" + n + "@t.io", box, "ATHLETE");
        TokMem athleteB = member("annb-" + n + "@t.io", box, "ATHLETE");
        User sender = authService.register("annsend-" + n + "@t.io", "correct-horse-battery", "Sender");

        actAsUser(sender.getId(), box.getId());
        ClassSession s = new ClassSession();
        s.setName("Roster Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(10);
        sessions.save(s);

        Booking booking = new Booking();
        booking.setSessionId(s.getId());
        booking.setMembershipId(athleteA.membershipId());
        booking.setStatus("BOOKED");
        bookings.save(booking);

        announcementService.send("Roster only", "CLASS_ROSTER", s.getId());
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcement.body").value("Roster only"));

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteB.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcement").doesNotExist());
    }

    /**
     * The user's complaint made concrete for the home card: it must name the actual sender, not
     * "your box" — a coach's CLASS_ROSTER send names the coach.
     */
    @Test
    void homeAnnouncementCarriesTheSenderName() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("AnnSender " + n, "ann-sender-" + n);
        TokMem athleteA = member("anns-" + n + "@t.io", box, "ATHLETE");
        User sender = authService.register("annsends-" + n + "@t.io", "correct-horse-battery", "Coach Sender");

        actAsUser(sender.getId(), box.getId());
        ClassSession s = new ClassSession();
        s.setName("Roster Class");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(10);
        sessions.save(s);

        Booking booking = new Booking();
        booking.setSessionId(s.getId());
        booking.setMembershipId(athleteA.membershipId());
        booking.setStatus("BOOKED");
        bookings.save(booking);

        announcementService.send("Roster only", "CLASS_ROSTER", s.getId());
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcement.sentByName").value("Coach Sender"));
    }

    /**
     * A system/seed send (no author) must carry a JSON null sentByName on the home card too — never
     * the box name or a placeholder. Parsed directly: JsonNode.get() on a genuinely missing key
     * returns null (which would NPE on isNull()), so this proves the key is present-and-null.
     */
    @Test
    void homeAnnouncementWithNoAuthorHasNullSenderName() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("AnnNoAuthor " + n, "ann-noauthor-" + n);
        TokMem athleteA = member("annna-" + n + "@t.io", box, "ATHLETE");

        com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("No author", "EVERYONE", null, null));

        String body = mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        com.fasterxml.jackson.databind.JsonNode node = om.readTree(body);
        org.assertj.core.api.Assertions.assertThat(node.get("announcement").get("sentByName").isNull()).isTrue();
    }

    /**
     * The home card's unread badge (this change): two announcements sent to the member, one marked
     * read via the existing mark-read endpoint — the aggregate must report exactly 1 unread, not 2.
     *
     * Negative control (verified, not left in the suite): changing HomeController's finder call
     * from countByMembershipIdAndReadAtIsNull to countByMembershipId (counting every row regardless
     * of readAt) made homeCarriesTheUnreadAnnouncementCount go RED:
     * java.lang.AssertionError: JSON path "$.announcementUnread" expected:<1> but was:<2>
     */
    @Test
    void homeCarriesTheUnreadAnnouncementCount() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("Unread " + n, "unread-" + n);
        TokMem athleteA = member("unra-" + n + "@t.io", box, "ATHLETE");

        com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("First", "EVERYONE", null, null));
        UUID secondId = com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("Second", "EVERYONE", null, null)).getId();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcementUnread").value(2));

        mvc.perform(post("/api/box/me/announcements/" + secondId + "/read")
                        .header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcementUnread").value(1));
    }

    @Test
    void homeUnreadCountIsZeroWhenAllRead() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("UnreadZero " + n, "unread-zero-" + n);
        TokMem athleteA = member("unrz-" + n + "@t.io", box, "ATHLETE");

        UUID firstId = com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("First", "EVERYONE", null, null)).getId();
        UUID secondId = com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("Second", "EVERYONE", null, null)).getId();

        mvc.perform(post("/api/box/me/announcements/" + firstId + "/read")
                        .header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk());
        mvc.perform(post("/api/box/me/announcements/" + secondId + "/read")
                        .header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcementUnread").value(0));
    }

    @Test
    void homeUnreadCountIsZeroWithNoAnnouncements() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("UnreadNone " + n, "unread-none-" + n);
        TokMem athleteA = member("unrn-" + n + "@t.io", box, "ATHLETE");

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcementUnread").value(0));
    }

    /**
     * Confidentiality (spec §4): another member's unread announcements must never raise my count —
     * exactly the defect a finder that lost its membership predicate (e.g. counting by announcement
     * or by box) would introduce.
     */
    @Test
    void homeUnreadCountIsNotRaisedByAnotherMembersUnreadAnnouncements() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("UnreadCross " + n, "unread-cross-" + n);
        TokMem athleteA = member("unrca-" + n + "@t.io", box, "ATHLETE");
        member("unrcb-" + n + "@t.io", box, "ATHLETE"); // athlete B — never reads its own copy

        com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("Broadcast", "EVERYONE", null, null));

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athleteA.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.announcementUnread").value(1));
    }
}
