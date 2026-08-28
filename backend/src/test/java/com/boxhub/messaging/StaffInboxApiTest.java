package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The staff shared inbox (D-1, D-3). See spec §4 and §6.
 */
class StaffInboxApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String athleteToken, coachToken, adminToken, foreignAdminToken;
    Membership athleteMembership, otherAthleteMembership;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box box = newBox("Inbox " + n, "inbox-" + n);
        Box other = newBox("ForeignInbox " + n, "finbox-" + n);

        User athlete = authService.register("ia-" + n + "@t.io", "correct-horse-battery", "Ada");
        User otherAthlete = authService.register("ib-" + n + "@t.io", "correct-horse-battery", "Bo");
        User coach = authService.register("ic-" + n + "@t.io", "correct-horse-battery", "Coach");
        User admin = authService.register("id-" + n + "@t.io", "correct-horse-battery", "Admin");
        User foreignAdmin = authService.register("ie-" + n + "@t.io", "correct-horse-battery", "Foreign");

        athleteMembership = member(athlete, box, "ATHLETE");
        otherAthleteMembership = member(otherAthlete, box, "ATHLETE");
        athleteToken = tokenService.boxToken(athlete, athleteMembership);
        tokenService.boxToken(otherAthlete, otherAthleteMembership);
        coachToken = tokenService.boxToken(coach, member(coach, box, "COACH"));
        adminToken = tokenService.boxToken(admin, member(admin, box, "BOX_ADMIN"));
        foreignAdminToken = tokenService.boxToken(foreignAdmin, member(foreignAdmin, other, "BOX_ADMIN"));
    }

    /** HAPPY: both directions, coach included. */
    @Test
    void coachRepliesAndTheMemberSeesIt() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteToken)
                .content("{\"body\":\"Is the 6am on?\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/threads").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].needsReply").value(true))
                .andExpect(jsonPath("$[0].lastMessagePreview").value("Is the 6am on?"));

        mvc.perform(post("/api/box/threads/" + athleteMembership.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Yes, see you there.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderSide").value("STAFF"));

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$.messages.length()").value(2));
    }

    /** D-3: one shared marker. Coach A reading clears it for Admin B. */
    @Test
    void readingClearsTheThreadForTheWholeStaff() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + athleteToken)
                .content("{\"body\":\"hi\"}")).andExpect(status().isOk());

        mvc.perform(post("/api/box/threads/" + athleteMembership.getId() + "/read")
                .header("Authorization", "Bearer " + coachToken)).andExpect(status().isOk());

        mvc.perform(get("/api/box/threads").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$[0].needsReply").value(false));
    }

    /** AUTH-DENIED: an athlete may not reach the staff inbox at all. */
    @Test
    void athleteCannotReachTheStaffInbox() throws Exception {
        mvc.perform(get("/api/box/threads").header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /**
     * CROSS-MEMBER-DENIED, the athlete-shaped attack: an athlete who KNOWS another member's
     * membershipId still cannot read their thread, because this route is staff-only.
     * Negative control: remove RoleGuard.requireStaff() from `thread` and this goes red —
     * and so does AuthzConformanceTest probe (c).
     */
    @Test
    void athleteWithAKnownMembershipIdIsStillForbidden() throws Exception {
        mvc.perform(get("/api/box/threads/" + otherAthleteMembership.getId())
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isForbidden());
    }

    /** CROSS-TENANT-DENIED: a foreign box's admin cannot address our member. */
    @Test
    void foreignBoxAdminCannotOpenOurMembersThread() throws Exception {
        mvc.perform(get("/api/box/threads/" + athleteMembership.getId())
                        .header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isForbidden());
    }

    /** Staff sending first creates the thread — no separate create call. */
    @Test
    void staffCanOpenAConversationWithAMemberWhoNeverWrote() throws Exception {
        mvc.perform(post("/api/box/threads/" + athleteMembership.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"body\":\"Your plan lapses Friday.\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + athleteToken))
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].senderSide").value("STAFF"));
    }

    /** A GET must not write — otherwise the shared inbox fills with threads nobody started. */
    @Test
    void openingAMembersThreadDoesNotCreateARow() throws Exception {
        int before = countThreads();
        mvc.perform(get("/api/box/threads/" + athleteMembership.getId())
                .header("Authorization", "Bearer " + coachToken)).andExpect(status().isOk());
        assertThat(countThreads()).isEqualTo(before);
    }

    private int countThreads() {
        Integer n = jdbc.queryForObject("select count(*) from message_thread", Integer.class);
        return n == null ? 0 : n;
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
}
