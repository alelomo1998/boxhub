package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Segmented announcements: audience resolution, frozen-at-send (D-2), history (D-4), and the
 * confidentiality rules of spec §4. See spec §5.
 */
class AnnouncementSegmentTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AnnouncementService announcementService;
    @Autowired JdbcTemplate jdbc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;

    Box box;
    String adminToken, coachToken, athleteToken, otherAthleteToken, foreignAthleteToken, foreignCoachToken;
    UUID athleteMembershipId, otherAthleteMembershipId, coachUserId, otherCoachUserId;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        box = newBox("Seg " + n, "seg-" + n);
        Box foreign = newBox("ForeignSeg " + n, "fseg-" + n);

        User admin = authService.register("sa-" + n + "@t.io", "correct-horse-battery", "Admin");
        User coach = authService.register("sc-" + n + "@t.io", "correct-horse-battery", "Coach");
        User otherCoach = authService.register("sc2-" + n + "@t.io", "correct-horse-battery", "Coach2");
        User athlete = authService.register("sx-" + n + "@t.io", "correct-horse-battery", "Ada");
        User otherAthlete = authService.register("sy-" + n + "@t.io", "correct-horse-battery", "Bo");
        User foreignAthlete = authService.register("sz-" + n + "@t.io", "correct-horse-battery", "Foreign");
        User foreignCoach = authService.register("sfc-" + n + "@t.io", "correct-horse-battery", "ForeignCoach");

        adminToken = tokenService.boxToken(admin, member(admin, box, "BOX_ADMIN"));
        coachToken = tokenService.boxToken(coach, member(coach, box, "COACH"));
        coachUserId = coach.getId();
        otherCoachUserId = otherCoach.getId();
        member(otherCoach, box, "COACH");
        Membership athleteMembership = member(athlete, box, "ATHLETE");
        athleteToken = tokenService.boxToken(athlete, athleteMembership);
        athleteMembershipId = athleteMembership.getId();
        Membership otherAthleteMembership = member(otherAthlete, box, "ATHLETE");
        otherAthleteToken = tokenService.boxToken(otherAthlete, otherAthleteMembership);
        otherAthleteMembershipId = otherAthleteMembership.getId();
        foreignAthleteToken = tokenService.boxToken(foreignAthlete, member(foreignAthlete, foreign, "ATHLETE"));
        foreignCoachToken = tokenService.boxToken(foreignCoach, member(foreignCoach, foreign, "COACH"));
    }

    /** D-2, THE decision. Negative control: resolve at read time and this goes red. */
    @Test
    void audienceIsFrozenAtSendSoARenewalDoesNotUnsendIt() throws Exception {
        givePlan(athleteMembershipId, 5); // expires in 5 days -> inside the 14-day EXPIRING window

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Renew before Friday\",\"segment\":\"EXPIRING\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentCount").value(1))
                .andExpect(jsonPath("$.segment").value("EXPIRING"));

        renewAthleteForAnotherYear(); // no longer expiring within 14 days

        mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].body").value("Renew before Friday"));
    }

    /** D-7: waitlisted members are included; cancelled members are excluded. */
    @Test
    void classRosterIncludesWaitlistAndExcludesCancelled() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        Booking booked = booking(session.getId(), athleteMembershipId, "BOOKED");
        Booking waitlisted = booking(session.getId(), otherAthleteMembershipId, "WAITLIST");
        // a third member, cancelled, must NOT be in the roster
        Membership cancelledMembership = memberForNewUser("cancelled");
        booking(session.getId(), cancelledMembership.getId(), "CANCELLED");
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"6am is cancelled\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentCount").value(2));

        mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + otherAthleteToken))
                .andExpect(jsonPath("$.length()").value(1));
    }

    /** D-4: history is append-only, not a single overwritten row. */
    @Test
    void twoSendsLeaveTwoRowsInHistory() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"First\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Second\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/announcements").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].body").value("Second"))
                .andExpect(jsonPath("$[1].body").value("First"));
    }

    /** D-8, narrowed: coaches may send announcements, not only admins — but only to their own class. */
    @Test
    void aCoachMaySend() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Coach sent this\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk());
    }

    /** D-8, narrowed: the exact case D-8 was written for still works. */
    @Test
    void coachCanAnnounceToTheirOwnClassRoster() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"6am moved to 7am\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk());
    }

    /** D-8, narrowed: a coach cannot broadcast to the whole gym. */
    @Test
    void coachCannotAnnounceToEveryone() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Gym-wide\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isForbidden());
    }

    /** D-8, narrowed: a coach cannot dun expiring members. */
    @Test
    void coachCannotAnnounceToExpiring() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Renew now\",\"segment\":\"EXPIRING\"}"))
                .andExpect(status().isForbidden());
    }

    /**
     * D-8, narrowed. THE LOAD-BEARING CASE: a coach must not be able to announce to a class assigned
     * to a different coach. Negative control: remove the coach-owns-the-session comparison from
     * assertMaySendToSegment and this goes red while coachCanAnnounceToTheirOwnClassRoster stays green.
     */
    @Test
    void coachCannotAnnounceToAnotherCoachsClass() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(otherCoachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Not my class\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    /** D-8, narrowed: an unassigned session (null coachId) belongs to no coach; only an admin may reach it. */
    @Test
    void coachCannotAnnounceToAnUnassignedSession() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(); // coachId null
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Unassigned\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    /** D-8, narrowed: admins remain unrestricted after the coach narrowing. */
    @Test
    void adminCanStillAnnounceToEveryone() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"From admin\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk());
    }

    /** CROSS-TENANT-DENIED: a coach from box B naming a box A session must not resolve it. */
    @Test
    void foreignCoachCannotAnnounceToOurClassRoster() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + foreignCoachToken)
                        .content("{\"body\":\"Cross-tenant\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    /** AUTH-DENIED */
    @Test
    void anAthleteMayNotSend() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"body\":\"hack\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isForbidden());
    }

    /**
     * CROSS-MEMBER-DENIED. A CLASS_ROSTER send addresses athlete A only; athlete B (same box,
     * ACTIVE, and a real recipient of nothing here) must get 404 trying to mark it read, and A's
     * read_at must stay null. Negative control: drop the membershipId predicate from
     * findByMembershipIdAndAnnouncementId and this must go red.
     */
    @Test
    void memberCannotMarkAnotherMembersAnnouncementRead() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED"); // A only
        SecurityContextHolder.clearContext();

        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"For A only\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentCount").value(1))
                .andReturn().getResponse().getContentAsString();

        UUID announcementId = UUID.fromString(
                com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                        .readTree(body).get("id").asText());

        // B was never sent this announcement.
        mvc.perform(post("/api/box/me/announcements/" + announcementId + "/read")
                        .header("Authorization", "Bearer " + otherAthleteToken))
                .andExpect(status().isNotFound());

        // A's own read state must be unaffected (still unread) by B's failed attempt.
        mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$[0].read").value(false));
    }

    /** CROSS-TENANT-DENIED */
    @Test
    void foreignBoxSeesNoneOfOurAnnouncements() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Marker-Only-For-Our-Box\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + foreignAthleteToken))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("Marker-Only-For-Our-Box"))));
    }

    // --- fixtures -----------------------------------------------------------------------------

    private void givePlan(UUID membershipId, int durationDays) {
        actAsBox(box.getId());
        Plan p = new Plan();
        p.setName("Plan " + durationDays);
        p.setDurationDays(durationDays);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(membershipId, planId, 0, "test");
        SecurityContextHolder.clearContext();
    }

    /** Pushes the athlete's current subscription well past the 14-day EXPIRING window. */
    private void renewAthleteForAnotherYear() {
        jdbc.update("update subscription set current_period_end = ? where membership_id = ? and status = 'ACTIVE'",
                java.sql.Timestamp.from(Instant.now().plusSeconds(365L * 24 * 3600)), athleteMembershipId);
    }

    /** Unassigned session: no coach, so only an admin may announce to it. */
    private ClassSession newSession() {
        return newSession(null);
    }

    private ClassSession newSession(UUID coachId) {
        ClassSession s = new ClassSession();
        s.setName("6am WOD");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        s.setCoachId(coachId);
        return sessions.save(s);
    }

    private Booking booking(UUID sessionId, UUID membershipId, String status) {
        Booking b = new Booking();
        b.setSessionId(sessionId);
        b.setMembershipId(membershipId);
        b.setStatus(status);
        return bookings.save(b);
    }

    private Membership memberForNewUser(String label) {
        long n = System.nanoTime();
        User u = authService.register(label + "-" + n + "@t.io", "correct-horse-battery", label);
        return member(u, box, "ATHLETE");
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private Membership member(User u, Box box, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        return memberships.save(m);
    }
    /**
     * DevDataSeeder sends inside TenantContext.runAsBox, whose synthetic JWT carries a RANDOM UUID
     * subject — not a real user. announcement.sent_by references users(id), so stamping the caller's
     * "user id" there blows up on the foreign key and the dev stack fails to seed. The suite cannot
     * see this on its own: DevDataSeeder is @Profile("dev") and never runs in tests.
     *
     * Negative control: make send() take sentBy from TenantContext.userId() again and this goes red.
     */
    @Test
    void sendingFromASystemContextDoesNotViolateTheSentByForeignKey() {
        UUID boxId = box.getId();
        com.boxhub.box.Announcement a = com.boxhub.shared.TenantContext.runAsBox(boxId,
                () -> announcementService.send("Seeded announcement", "EVERYONE", null, null));
        org.assertj.core.api.Assertions.assertThat(a.getId()).isNotNull();
        org.assertj.core.api.Assertions.assertThat(a.getSentBy()).isNull();
    }

}
