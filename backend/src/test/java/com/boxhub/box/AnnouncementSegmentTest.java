package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
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
import java.time.LocalTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

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

    // --- sentByName -------------------------------------------------------------------------------

    /**
     * The user's own complaint: "the header is not from your box as can it be from a coach and not
     * from an admin". An admin's EVERYONE send and a coach's CLASS_ROSTER send land in the same
     * member's list, and the two rows must name different senders — asserted together so a mix is
     * actually covered, not just "the last sender wins".
     */
    @Test
    void myAnnouncementsCarryTheSenderName() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED");
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"From admin\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"From coach\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk());

        String body = mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andReturn().getResponse().getContentAsString();

        JsonNode rows = MAPPER.readTree(body);
        String adminRowSender = null, coachRowSender = null;
        for (JsonNode row : rows) {
            if ("From admin".equals(row.get("body").asText())) adminRowSender = row.get("sentByName").asText();
            if ("From coach".equals(row.get("body").asText())) coachRowSender = row.get("sentByName").asText();
        }
        assertThat(adminRowSender).isEqualTo("Admin");
        assertThat(coachRowSender).isEqualTo("Coach");
    }

    /**
     * A system/seed send (no author) must show a JSON null sentByName — not the string "null", not
     * an absent key. JsonNode.get() returns null on a genuinely missing key (which would NPE below),
     * so asserting isNull() on the retrieved node proves the key is present and explicitly null.
     */
    @Test
    void anAuthorlessAnnouncementHasNullSenderName() throws Exception {
        com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("No author", "EVERYONE", null, null));

        String body = mvc.perform(get("/api/box/me/announcements").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode row = MAPPER.readTree(body).get(0);
        assertThat(row.get("sentByName").isNull()).isTrue();
    }

    // --- targets --------------------------------------------------------------------------------

    /** Admin sees every upcoming session regardless of who is assigned, or whether anyone is. */
    @Test
    void adminSeesEveryUpcomingSessionInTargets() throws Exception {
        actAsBox(box.getId());
        ClassSession mine = newSession(coachUserId);
        ClassSession other = newSession(otherCoachUserId);
        ClassSession unassigned = newSession();
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + mine.getId() + "')]").exists())
                .andExpect(jsonPath("$[?(@.id=='" + other.getId() + "')]").exists())
                .andExpect(jsonPath("$[?(@.id=='" + unassigned.getId() + "')]").exists());
    }

    /**
     * THE LOAD-BEARING CASE for /targets: a coach sees only their own sessions. Negative control:
     * drop the coachId comparison and this goes red — see the note at the end of this file.
     */
    @Test
    void coachSeesOnlyTheirOwnSessionsInTargets() throws Exception {
        actAsBox(box.getId());
        ClassSession mine = newSession(coachUserId);
        ClassSession other = newSession(otherCoachUserId);
        ClassSession unassigned = newSession();
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + mine.getId() + "')]").exists())
                .andExpect(jsonPath("$[?(@.id=='" + other.getId() + "')]").doesNotExist())
                .andExpect(jsonPath("$[?(@.id=='" + unassigned.getId() + "')]").doesNotExist());
    }

    @Test
    void targetsExcludesCancelledSessions() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        jdbc.update("update class_sessions set status = 'CANCELLED' where id = ?", session.getId());
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + session.getId() + "')]").doesNotExist());
    }

    @Test
    void targetsExcludesPastSessions() throws Exception {
        actAsBox(box.getId());
        ClassSession past = newSession(coachUserId);
        jdbc.update("update class_sessions set start_at = ? where id = ?",
                java.sql.Timestamp.from(Instant.now().minusSeconds(3600)), past.getId());
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + past.getId() + "')]").doesNotExist());
    }

    /** AUTH-DENIED */
    @Test
    void athleteCannotReadTargets() throws Exception {
        mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /** CROSS-TENANT-DENIED */
    @Test
    void targetsDoesNotLeakAnotherBoxesSessions() throws Exception {
        actAsBox(box.getId());
        ClassSession ours = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        long n = System.nanoTime();
        Box foreignBox = newBox("TargetsLeak " + n, "tleak-" + n);
        actAsBox(foreignBox.getId());
        ClassSession foreignSession = newSession(otherCoachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + ours.getId() + "')]").exists())
                .andExpect(jsonPath("$[?(@.id=='" + foreignSession.getId() + "')]").doesNotExist());
    }

    /**
     * THE point of recipientCount: the card's number and the confirm dialog's number must never
     * disagree for the same session. Deliberately mixes BOOKED + CHECKED_IN + WAITLIST + a
     * CANCELLED that must not count, so a naive bookedCount+waitlistCount sum would still pass —
     * this only fails if recipientCount stops matching SegmentResolver.roster's own rule.
     */
    @Test
    void targetRecipientCountMatchesPreviewForTheSameSession() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED");
        booking(session.getId(), otherAthleteMembershipId, "CHECKED_IN");
        Membership waitlisted = memberForNewUser("wait");
        booking(session.getId(), waitlisted.getId(), "WAITLIST");
        Membership cancelled = memberForNewUser("cancelled");
        booking(session.getId(), cancelled.getId(), "CANCELLED");
        SecurityContextHolder.clearContext();

        long recipientCount = findTarget(adminToken, session.getId()).get("recipientCount").asLong();

        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "CLASS_ROSTER").param("segmentRef", session.getId().toString())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(recipientCount));
    }

    /** The card needs an image and a coach name, not just an id and a time. */
    @Test
    void targetCarriesCoachNameAndImage() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSessionWithSlotImage(coachUserId, "classtype/metcon.jpg");
        SecurityContextHolder.clearContext();

        JsonNode node = findTarget(adminToken, session.getId());
        assertThat(node.get("imagePath").asText()).startsWith("classtype/metcon.jpg");
        assertThat(node.get("coachName").asText()).isEqualTo("Coach");
    }

    /** A coach never sees unassigned sessions at all; an admin does, with a null coach name. */
    @Test
    void targetForUnassignedSessionHasNullCoachName() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(); // coachId null
        SecurityContextHolder.clearContext();

        JsonNode node = findTarget(adminToken, session.getId());
        assertThat(node.get("coachName").isNull()).isTrue();
    }

    /** No schedule slot at all (newSession()'s shape) -> null, never an empty string or a crash. */
    @Test
    void targetWithNoClassTypeImageReturnsNullImagePath() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        JsonNode node = findTarget(adminToken, session.getId());
        assertThat(node.get("imagePath").isNull()).isTrue();
    }

    /** CANCELLED and NO_SHOW are in neither the booked, waitlist, nor recipient counts. */
    @Test
    void targetCountsExcludeCancelledAndNoShow() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED");
        Membership cancelled = memberForNewUser("cancelled");
        booking(session.getId(), cancelled.getId(), "CANCELLED");
        Membership noShow = memberForNewUser("noshow");
        booking(session.getId(), noShow.getId(), "NO_SHOW");
        SecurityContextHolder.clearContext();

        JsonNode node = findTarget(adminToken, session.getId());
        assertThat(node.get("bookedCount").asLong()).isEqualTo(1);
        assertThat(node.get("waitlistCount").asLong()).isEqualTo(0);
        assertThat(node.get("recipientCount").asLong()).isEqualTo(1);
    }

    /** The difference between SegmentResolver's rule and the naive one: CHECKED_IN counts as booked. */
    @Test
    void targetBookedCountIncludesCheckedIn() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "CHECKED_IN");
        SecurityContextHolder.clearContext();

        JsonNode node = findTarget(adminToken, session.getId());
        assertThat(node.get("bookedCount").asLong()).isEqualTo(1);
    }

    // --- preview ----------------------------------------------------------------------------------

    /** The number the confirm dialog shows must be the number the send actually writes. */
    @Test
    void previewCountMatchesWhatTheSendWrites() throws Exception {
        String previewBody = mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "EVERYONE")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long previewedCount = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(previewBody).get("count").asLong();

        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Preview parity\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sentCount").value(previewedCount));
    }

    /** Mirrors coachCannotAnnounceToAnotherCoachsClass: preview must not leak another coach's roster size. */
    @Test
    void coachCannotPreviewAnotherCoachsClass() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(otherCoachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "CLASS_ROSTER").param("segmentRef", session.getId().toString())
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void coachCannotPreviewEveryone() throws Exception {
        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "EVERYONE")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isForbidden());
    }

    /**
     * The count is asserted EXACTLY, not as "at least zero": the fixture puts five active
     * memberships in this box (admin, coach, otherCoach, athlete, otherAthlete), and a preview that
     * resolved nothing at all would satisfy any loose bound while telling the confirm dialog a lie.
     * If the fixture gains a member this goes red on purpose — update the number deliberately.
     */
    @Test
    void adminCanPreviewEveryone() throws Exception {
        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "EVERYONE")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(5));
    }

    /** AUTH-DENIED */
    @Test
    void athleteCannotPreview() throws Exception {
        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "EVERYONE")
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /**
     * A session id belonging to a foreign box. For a coach: assertMaySendToSegment's box-scoped
     * lookup fails to find it, so it is treated as "not found" -> 403, never a count. For an admin:
     * assertMaySendToSegment returns early (admins are unrestricted), so the foreign id reaches
     * SegmentResolver.roster, whose bookings.findBySessionId is itself box-filtered -> 0, not a leak.
     */
    @Test
    void previewOfAForeignBoxSession() throws Exception {
        long n = System.nanoTime();
        Box foreignBox = newBox("PreviewLeak " + n, "pleak-" + n);
        actAsBox(foreignBox.getId());
        ClassSession foreignSession = newSession(otherCoachUserId);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "CLASS_ROSTER").param("segmentRef", foreignSession.getId().toString())
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/box/announcements/preview")
                        .param("segment", "CLASS_ROSTER").param("segmentRef", foreignSession.getId().toString())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0));
    }

    // --- history scoping (mine-only) -----------------------------------------------------------

    /**
     * THE user-visible bug being fixed: an admin must not see a coach's sends and vice versa. Not a
     * length check alone — asserts the actual bodies/ids are the right ones and the wrong ones are
     * absent.
     */
    @Test
    void historyShowsOnlyMyOwnSends() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        String adminBody = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"From admin\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID adminAnnouncementId = UUID.fromString(MAPPER.readTree(adminBody).get("id").asText());

        String coachBody = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"From coach\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID coachAnnouncementId = UUID.fromString(MAPPER.readTree(coachBody).get("id").asText());

        mvc.perform(get("/api/box/announcements").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(adminAnnouncementId.toString()))
                .andExpect(jsonPath("$[?(@.id=='" + coachAnnouncementId + "')]").doesNotExist());

        mvc.perform(get("/api/box/announcements").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(coachAnnouncementId.toString()))
                .andExpect(jsonPath("$[?(@.id=='" + adminAnnouncementId + "')]").doesNotExist());
    }

    /** A pre-M29a/system row with no author belongs to nobody's outbox. Deliberate, not a bug. */
    @Test
    void historyExcludesSendsWithNoAuthor() throws Exception {
        Announcement a = com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("No author", "EVERYONE", null, null));

        mvc.perform(get("/api/box/announcements").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + a.getId() + "')]").doesNotExist());
        mvc.perform(get("/api/box/announcements").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + a.getId() + "')]").doesNotExist());
    }

    // --- recipients -----------------------------------------------------------------------------

    @Test
    void senderSeesRecipientsWithReadState() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED");
        booking(session.getId(), otherAthleteMembershipId, "BOOKED");
        SecurityContextHolder.clearContext();

        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Read state\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get("id").asText());

        mvc.perform(post("/api/box/me/announcements/" + announcementId + "/read")
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipients.length()").value(2))
                .andExpect(jsonPath("$.recipients[?(@.membershipId=='" + athleteMembershipId + "')].readAt").exists())
                .andExpect(jsonPath("$.recipients[?(@.membershipId=='" + athleteMembershipId + "' && @.readAt==null)]").doesNotExist())
                .andExpect(jsonPath("$.recipients[?(@.membershipId=='" + otherAthleteMembershipId + "' && @.readAt==null)]").exists());
    }

    /**
     * "First read, then not read, all alphabetical" (the user's own words). The fixture is built so
     * plain alphabetical sorting would fail this: "Ada" (unread) alphabetically precedes "Bo" (read),
     * but Bo must still come first because Bo has read it.
     */
    @Test
    void recipientsAreSortedReadFirstThenAlphabetically() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED"); // "Ada", stays unread
        booking(session.getId(), otherAthleteMembershipId, "BOOKED"); // "Bo", will be marked read
        SecurityContextHolder.clearContext();

        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Sorted\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get("id").asText());

        mvc.perform(post("/api/box/me/announcements/" + announcementId + "/read")
                        .header("Authorization", "Bearer " + otherAthleteToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recipients[0].name").value("Bo"))
                .andExpect(jsonPath("$.recipients[0].readAt").isNotEmpty())
                .andExpect(jsonPath("$.recipients[1].name").value("Ada"))
                .andExpect(jsonPath("$.recipients[1].readAt").isEmpty());
    }

    @Test
    void detailOfAClassAnnouncementCarriesTheClassBrief() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        SecurityContextHolder.clearContext();

        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Class message\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get("id").asText());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clazz").exists())
                .andExpect(jsonPath("$.clazz.id").value(session.getId().toString()))
                .andExpect(jsonPath("$.clazz.name").value(session.getName()))
                .andExpect(jsonPath("$.clazz.startAt").exists())
                .andExpect(jsonPath("$.clazz.coachName").value("Coach"));
    }

    @Test
    void detailOfAnEveryoneAnnouncementHasNullClass() throws Exception {
        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Gym-wide\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get("id").asText());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clazz").doesNotExist());
    }

    /** THE rule: even another staff member of the same box may not read someone else's recipients. */
    @Test
    void anotherStaffMemberCannotReadMyRecipients() throws Exception {
        actAsBox(box.getId());
        ClassSession session = newSession(coachUserId);
        booking(session.getId(), athleteMembershipId, "BOOKED");
        SecurityContextHolder.clearContext();

        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Mine only\",\"segment\":\"CLASS_ROSTER\",\"segmentRef\":\""
                                + session.getId() + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get("id").asText());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isForbidden());
    }

    /** AUTH-DENIED */
    @Test
    void athleteCannotReadRecipients() throws Exception {
        mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Everyone\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk());

        String body = mvc.perform(get("/api/box/announcements").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get(0).get("id").asText());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /** CROSS-TENANT-DENIED: Announcement is @TenantId, so a foreign id is simply not found -> 403. */
    @Test
    void recipientsOfAnotherBoxesAnnouncementIsDenied() throws Exception {
        String body = mvc.perform(post("/api/box/announcements").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Ours\",\"segment\":\"EVERYONE\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        UUID announcementId = UUID.fromString(MAPPER.readTree(body).get("id").asText());

        mvc.perform(get("/api/box/announcements/" + announcementId + "/recipients")
                        .header("Authorization", "Bearer " + foreignCoachToken))
                .andExpect(status().isForbidden());
    }

    /** Guard against the null-equality slip: a null sentBy must never match any caller. */
    @Test
    void recipientsOfAnAuthorlessAnnouncementIsDenied() throws Exception {
        Announcement a = com.boxhub.shared.TenantContext.runAsBox(box.getId(),
                () -> announcementService.send("No author", "EVERYONE", null, null));

        mvc.perform(get("/api/box/announcements/" + a.getId() + "/recipients")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isForbidden());
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

    /**
     * A session generated from a real slot/type, unlike newSession() which leaves scheduleSlotId
     * null. Needed so /targets has an image to resolve.
     */
    private ClassSession newSessionWithSlotImage(UUID coachId, String imagePath) {
        ClassType t = new ClassType();
        t.setName("Metcon");
        t.setImagePath(imagePath);
        types.save(t);

        ScheduleSlot slot = new ScheduleSlot();
        slot.setClassTypeId(t.getId());
        slot.setWeekday(2);
        slot.setStartTime(LocalTime.of(18, 0));
        slot.setDurationMin(60);
        slot.setCapacity(12);
        slots.save(slot);

        ClassSession s = new ClassSession();
        s.setName("Metcon");
        s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60);
        s.setCapacity(12);
        s.setCoachId(coachId);
        s.setScheduleSlotId(slot.getId());
        return sessions.save(s);
    }

    /** Fetches /targets and returns the node for the given session id, failing loudly if absent. */
    private JsonNode findTarget(String token, UUID sessionId) throws Exception {
        String body = mvc.perform(get("/api/box/announcements/targets").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for (JsonNode n : MAPPER.readTree(body)) {
            if (n.get("id").asText().equals(sessionId.toString())) return n;
        }
        throw new AssertionError("session " + sessionId + " not found in /targets response: " + body);
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
