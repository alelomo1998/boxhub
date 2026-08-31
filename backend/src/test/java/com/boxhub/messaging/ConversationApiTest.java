package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * AMENDMENT A1: person-to-person conversations replace the shared box thread.
 * docs/superpowers/specs/2026-08-28-m29a-messaging-design.md, "AMENDMENT A1".
 *
 * A1.2 is the load-bearing rule: MessagingService.assertMayMessage is the ONLY place
 * "athlete may not message another athlete" is enforced, and the cross-member-denied tests below
 * are the only thing standing between that rule and a private-message leak.
 */
class ConversationApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    Box box, otherBox;
    Membership athleteA, athleteB, coach, admin, foreignAdmin;
    String athleteAToken, athleteBToken, coachToken, adminToken, foreignAdminToken;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        box = newBox("Conv " + n, "conv-" + n);
        otherBox = newBox("ForeignConv " + n, "fconv-" + n);

        User ua = authService.register("ca-" + n + "@t.io", "correct-horse-battery", "Ada");
        User ub = authService.register("cb-" + n + "@t.io", "correct-horse-battery", "Bo");
        User uc = authService.register("cc-" + n + "@t.io", "correct-horse-battery", "Coach");
        User ud = authService.register("cd-" + n + "@t.io", "correct-horse-battery", "Admin");
        User uf = authService.register("cf-" + n + "@t.io", "correct-horse-battery", "Foreign");

        athleteA = member(ua, box, "ATHLETE");
        athleteB = member(ub, box, "ATHLETE");
        coach = member(uc, box, "COACH");
        admin = member(ud, box, "BOX_ADMIN");
        foreignAdmin = member(uf, otherBox, "BOX_ADMIN");

        athleteAToken = tokenService.boxToken(ua, athleteA);
        athleteBToken = tokenService.boxToken(ub, athleteB);
        coachToken = tokenService.boxToken(uc, coach);
        adminToken = tokenService.boxToken(ud, admin);
        foreignAdminToken = tokenService.boxToken(uf, foreignAdmin);
    }

    // ───────────────────────── A1.2 core security property ─────────────────────────

    /** The single most important test in the milestone (A1.2). */
    @Test
    void athleteCannotMessageAnotherAthlete() throws Exception {
        mvc.perform(post("/api/box/conversations/" + athleteB.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteAToken)
                        .content("{\"body\":\"hey\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void athleteCanMessageACoach() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteAToken)
                        .content("{\"body\":\"Is the 6am on?\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void athleteCanMessageTheBoxAdmin() throws Exception {
        mvc.perform(post("/api/box/conversations/" + admin.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteAToken)
                        .content("{\"body\":\"Billing question\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void staffCanMessageAnAthlete() throws Exception {
        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"Great session today\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void nobodyCanMessageThemselves() throws Exception {
        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteAToken)
                        .content("{\"body\":\"note to self\"}"))
                .andExpect(status().isForbidden());
    }

    /**
     * Isolates the self-check from the athlete-target rule: staff may address any role, so this
     * would pass the role check and only the self-check stops it — unlike the athlete case above,
     * where an athlete messaging "themselves" is also blocked by "athletes may only message staff"
     * even if the self-check were deleted. Negative control (see brief report) proved exactly this.
     */
    @Test
    void staffCannotMessageThemselves() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"body\":\"note to self\"}"))
                .andExpect(status().isForbidden());
    }

    // ───────────────────────── GET must not write ─────────────────────────

    /**
     * A GET MUST NOT WRITE. Both read paths in the superseded design called the creating
     * threadFor(); readonly=true's MANUAL flush mode hid the insert. Verified by negative control
     * (see brief report): pointing get() at threadFor() instead of findThread() turns this red.
     */
    @Test
    void readingAConversationDoesNotCreateAThread() throws Exception {
        int before = countThreads();
        mvc.perform(get("/api/box/conversations/" + coach.getId())
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(0));
        assertThat(countThreads()).isEqualTo(before);
    }

    @Test
    void markingAnEmptyConversationReadDoesNotCreateAThread() throws Exception {
        int before = countThreads();
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/read")
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk());
        assertThat(countThreads()).isEqualTo(before);
    }

    // ───────────────────────── contacts ─────────────────────────

    @Test
    void contactsExcludeOtherAthletesForAnAthlete() throws Exception {
        mvc.perform(get("/api/box/contacts").header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.role == 'ATHLETE')]").isEmpty())
                .andExpect(jsonPath("$[?(@.role == 'COACH')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.role == 'BOX_ADMIN')]").isNotEmpty());
    }

    @Test
    void contactsIncludeAthletesForStaff() throws Exception {
        mvc.perform(get("/api/box/contacts").header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.role == 'ATHLETE')]").isNotEmpty());
    }

    @Test
    void contactsHappy() throws Exception {
        mvc.perform(get("/api/box/contacts").header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk());
    }

    @Test
    void contactsAnonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/contacts")).andExpect(status().isUnauthorized());
    }

    @Test
    void contactsAreScopedToTheCallersBox() throws Exception {
        mvc.perform(get("/api/box/contacts").header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Ada')]").isEmpty())
                .andExpect(jsonPath("$[?(@.name == 'Coach')]").isEmpty());
    }

    // ───────────────────────── conversations list ─────────────────────────

    @Test
    void conversationsListHappy() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                .content("{\"body\":\"hi\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/conversations").header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].membershipId").value(coach.getId().toString()));
    }

    @Test
    void conversationsListAnonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/conversations")).andExpect(status().isUnauthorized());
    }

    @Test
    void conversationsListIsScopedToTheCallersBox() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                .content("{\"body\":\"ADA-PRIVATE-MARKER\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/conversations").header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("ADA-PRIVATE-MARKER"))));
    }

    // ───────────────────────── GET one conversation ─────────────────────────

    @Test
    void getConversationHappy() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                .content("{\"body\":\"hi coach\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/conversations/" + coach.getId())
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].mine").value(true));

        // The coach's own view of the same conversation: not "mine" from their side.
        mvc.perform(get("/api/box/conversations/" + athleteA.getId())
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].mine").value(false));
    }

    /**
     * A1.8: counterpartLastReadAt is the OTHER participant's marker, not the caller's own — the
     * obvious way to get this backwards is to return the caller's marker, which would make every
     * message look read to its own sender. Negative control (see brief report): swapping
     * lastReadForCounterpartOf(me) for lastReadFor(me) in the controller turns this red.
     */
    @Test
    void counterpartLastReadAtReflectsTheOtherPersonsMarker() throws Exception {
        String sendResponse = mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                        .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                        .content("{\"body\":\"hi coach\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Instant sentAt = Instant.parse(om.readTree(sendResponse).get("createdAt").asText());

        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/read")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk());

        String detail = mvc.perform(get("/api/box/conversations/" + coach.getId())
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode counterpartLastReadAt = om.readTree(detail).get("counterpartLastReadAt");

        assertThat(counterpartLastReadAt.isNull()).isFalse();
        // Strict: the coach's read happens as a later, separate HTTP call, always measurably after
        // the send. isAfterOrEqualTo would let the caller's-own-marker bug slip through here, since
        // A's own marker is set in the same method call as the message and can land in the same
        // instant as its createdAt — see test 2 and the brief report for the negative control.
        assertThat(Instant.parse(counterpartLastReadAt.asText())).isAfter(sentAt);
    }

    /**
     * A1.8: before the coach ever opens the thread, A sending a message sets A's OWN marker (the
     * sender has, by definition, read their own message) but not the coach's — so from A's side,
     * counterpartLastReadAt must stay null. This is the sharpest negative control for the same bug
     * as above: the caller's-own-marker mistake would make this field non-null here too.
     */
    @Test
    void counterpartLastReadAtIsNullBeforeAnyoneReads() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                        .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                        .content("{\"body\":\"hi coach\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/conversations/" + coach.getId())
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counterpartLastReadAt").doesNotExist());
    }

    // readingAConversationDoesNotCreateAThread (above, "GET must not write") already covers
    // A1.8's third required test: reading must not create a thread. Still passes with the new
    // counterpartLastReadAt field wired in — confirmed, not duplicated here.

    @Test
    void getConversationAnonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/conversations/" + coach.getId())).andExpect(status().isUnauthorized());
    }

    @Test
    void getConversationCrossTenantDenied() throws Exception {
        mvc.perform(get("/api/box/conversations/" + athleteA.getId())
                        .header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void getConversationCrossMemberDenied() throws Exception {
        mvc.perform(get("/api/box/conversations/" + athleteB.getId())
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isForbidden());
    }

    // ───────────────────────── POST send ─────────────────────────

    @Test
    void sendAnonymousIsRejected() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages").with(csrf())
                .contentType(APPLICATION_JSON).content("{\"body\":\"hi\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sendCrossTenantDenied() throws Exception {
        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/messages")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + foreignAdminToken)
                        .content("{\"body\":\"hi\"}"))
                .andExpect(status().isForbidden());
    }
    // sendCrossMemberDenied === athleteCannotMessageAnotherAthlete, above.

    // ───────────────────────── POST read ─────────────────────────

    @Test
    void readHappy() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                .content("{\"body\":\"hi\"}")).andExpect(status().isOk());

        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/read")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isOk());
    }

    @Test
    void readAnonymousIsRejected() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/read").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void readCrossTenantDenied() throws Exception {
        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/read")
                        .header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void readCrossMemberDenied() throws Exception {
        mvc.perform(post("/api/box/conversations/" + athleteB.getId() + "/read")
                        .header("Authorization", "Bearer " + athleteAToken))
                .andExpect(status().isForbidden());
    }

    // ───────────────────────── pair / derived-state semantics ─────────────────────────

    @Test
    void onePairHasOneThreadRegardlessOfWhoSendsFirst() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                .content("{\"body\":\"from athlete\"}")).andExpect(status().isOk());

        mvc.perform(post("/api/box/conversations/" + athleteA.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + coachToken)
                .content("{\"body\":\"from coach\"}")).andExpect(status().isOk());

        Integer n = jdbc.queryForObject("select count(*) from message_thread where box_id = ?",
                Integer.class, box.getId());
        assertThat(n).isEqualTo(1);
    }

    @Test
    void unreadCountAndNeedsReplyAreViewerRelative() throws Exception {
        mvc.perform(post("/api/box/conversations/" + coach.getId() + "/messages")
                .contentType(APPLICATION_JSON).header("Authorization", "Bearer " + athleteAToken)
                .content("{\"body\":\"hi coach\"}")).andExpect(status().isOk());

        // Coach (B) sees needsReply true, unreadCount 1: the last message isn't theirs.
        mvc.perform(get("/api/box/conversations").header("Authorization", "Bearer " + coachToken))
                .andExpect(jsonPath("$[0].needsReply").value(true))
                .andExpect(jsonPath("$[0].unreadCount").value(1));

        // The sender (A) sees needsReply false: the last message IS theirs.
        mvc.perform(get("/api/box/conversations").header("Authorization", "Bearer " + athleteAToken))
                .andExpect(jsonPath("$[0].needsReply").value(false))
                .andExpect(jsonPath("$[0].unreadCount").value(0));
    }

    private int countThreads() {
        // Scoped to this test's box: the DB is shared across the whole suite (no per-test
        // rollback), so an unscoped count picks up rows other tests left behind.
        Integer n = jdbc.queryForObject("select count(*) from message_thread where box_id = ?",
                Integer.class, box.getId());
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
