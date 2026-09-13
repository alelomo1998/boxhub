package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.programming.*;
import com.boxhub.shared.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Team scoring: ONE result, N rows, one team_id (spec 5.2). Deliberately not a team_score table --
 * every leaderboard, history and analytics read keys on membership_id, so N rows keep all of them
 * working untouched, and unique (box_id, session_item_id, membership_id) still holds.
 */
class TeamScoreTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired WodScoreRepository scores;

    private UUID boxAId;
    private String coachTok, outsiderTok;
    /** Member tokens, index-aligned with {@link #memberIds}. */
    private final List<String> memberToks = new ArrayList<>();
    private final List<UUID> memberIds = new ArrayList<>();
    private UUID foreignMembership;
    private Box boxA, boxB;
    private long n;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        n = System.nanoTime();
        boxA = newBox("tst-a-" + n);
        boxB = newBox("tst-b-" + n);
        boxAId = boxA.getId();
        coachTok = tok("tstc-" + n + "@t.io", boxA, "COACH");
        outsiderTok = tok("tsto-" + n + "@t.io", boxA, "ATHLETE");
        foreignMembership = member(boxB, "tstf-" + n + "@t.io").getId();
    }

    /** A session_item whose wod is a team piece of {@code teamSize}, plus that many box-A athletes. */
    private UUID seedTeamPiece(int teamSize) {
        actAsBox(boxAId);
        UUID session = session();
        Wod w = new Wod();
        w.setTitle("Team Fran " + n);
        w.setMacro("WORKOUT");
        w.setTimingPreset("FOR_TIME");
        w.setScoreType("TIME");
        w.setTeamSize(teamSize);
        w.setTeamShare(teamSize == 1 ? null : "TOGETHER");
        w = wods.save(w);
        SessionItem i = new SessionItem();
        i.setSessionId(session);
        i.setWodId(w.getId());
        i.setSortOrder(0);
        i.setScoreable(true);
        i.setScoreType("TIME");
        UUID itemId = items.save(i).getId();
        SecurityContextHolder.clearContext();

        for (int k = 0; k < teamSize; k++) {
            String email = "tstm" + k + "-" + n + "@t.io";
            User u = authService.register(email, "correct-horse-battery", email);
            Membership m = new Membership();
            m.setUser(u); m.setBox(boxA); m.setRole("ATHLETE");
            m = memberships.save(m);
            memberIds.add(m.getId());
            memberToks.add(tokenService.boxToken(u, m));
        }
        return itemId;
    }

    @Test
    void aTeamResultWritesOneRowPerMemberSharingATeamId() throws Exception {
        UUID item = seedTeamPiece(2);
        post(item, memberToks.get(0), body(memberIds, "The Lads", 521)).andExpect(status().isOk());

        List<WodScore> rows = rows(item);
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getTeamId()).isNotNull();
        assertThat(rows).extracting("teamId").containsOnly(rows.get(0).getTeamId());
        assertThat(rows).extracting("timeSeconds").containsOnly(521);
        assertThat(rows).extracting("membershipId").containsExactlyInAnyOrderElementsOf(memberIds);
        assertThat(rows).extracting("teamName").containsOnly("The Lads");
    }

    @Test
    void memberCountMustMatchTheTeamSize() throws Exception {
        UUID item = seedTeamPiece(3);
        post(item, memberToks.get(0), body(memberIds.subList(0, 2), "Short", 521))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aMemberListedTwiceIsRefused() throws Exception {
        UUID item = seedTeamPiece(2);
        post(item, memberToks.get(0), body(List.of(memberIds.get(0), memberIds.get(0)), "Dup", 521))
                .andExpect(status().isBadRequest());
    }

    /** An athlete may not log a result for a team they are not in. */
    @Test
    void anAthleteOutsideTheTeamIsRefused() throws Exception {
        UUID item = seedTeamPiece(2);
        post(item, outsiderTok, body(memberIds, "Not mine", 521)).andExpect(status().isForbidden());
    }

    @Test
    void staffMayLogForATeamTheyAreNotIn() throws Exception {
        UUID item = seedTeamPiece(2);
        post(item, coachTok, body(memberIds, "The Lads", 521)).andExpect(status().isOk());
        assertThat(rows(item)).hasSize(2);
    }

    /** Cross-tenant: a membership from another box must not be scoreable here. */
    @Test
    void aForeignMembershipIsRefused() throws Exception {
        UUID item = seedTeamPiece(2);
        post(item, coachTok, body(List.of(memberIds.get(0), foreignMembership), "Mixed", 521))
                .andExpect(status().isNotFound());
        assertThat(rows(item)).isEmpty(); // one transaction: no partial team survives
    }

    /** Cross-tenant: another box's coach cannot even see the item. */
    @Test
    void anotherBoxCoachIsRefused() throws Exception {
        UUID item = seedTeamPiece(2);
        String foreignCoach = tok("tstfc-" + n + "@t.io", boxB, "COACH");
        post(item, foreignCoach, body(memberIds, "The Lads", 521)).andExpect(status().isNotFound());
    }

    /** Re-logging replaces rather than duplicating: unique (box_id, session_item_id, membership_id). */
    @Test
    void relogUpdatesRatherThanDuplicating() throws Exception {
        UUID item = seedTeamPiece(2);
        post(item, memberToks.get(0), body(memberIds, "The Lads", 521)).andExpect(status().isOk());
        post(item, memberToks.get(1), body(memberIds, "The Lads", 499)).andExpect(status().isOk());
        List<WodScore> rows = rows(item);
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting("timeSeconds").containsOnly(499);
    }

    // --- helpers (mirror CoachScoreEntryTest) ---

    private org.springframework.test.web.servlet.ResultActions post(UUID item, String token, String body)
            throws Exception {
        return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/api/box/sessions/items/" + item + "/score/team")
                .header("Authorization", "Bearer " + token)
                .contentType(APPLICATION_JSON).content(body));
    }

    private String body(List<UUID> ids, String teamName, int timeSeconds) {
        String list = String.join(",", ids.stream().map(i -> "\"" + i + "\"").toList());
        return "{\"membershipIds\":[" + list + "],\"teamName\":\"" + teamName + "\","
                + "\"rx\":true,\"timeSeconds\":" + timeSeconds + ",\"finished\":true,\"isPrivate\":false}";
    }

    /**
     * mvc.perform resolves its own request-scoped tenant from the Authorization header; back on the
     * test thread the SecurityContext is empty, so a read on @TenantId WodScore fails CLOSED and
     * returns empty (post-M21). Establish the real box or every assertion passes vacuously.
     */
    private List<WodScore> rows(UUID item) {
        return TenantContext.runAsBox(boxAId, () -> scores.findBySessionItemId(item));
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256").subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String s) {
        Box x = new Box(); x.setName(s); x.setSlug(s); x.setTimezone("Europe/Rome"); return boxes.save(x);
    }

    private String tok(String e, Box box, String role) {
        User u = authService.register(e, "correct-horse-battery", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role); memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private Membership member(Box box, String e) {
        User u = authService.register(e, "correct-horse-battery", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole("ATHLETE");
        return memberships.save(m);
    }

    /** Scoring requires a PUBLISHED programming status -- ScoreService.loggableItem. */
    private UUID session() {
        ClassSession s = new ClassSession();
        s.setName("Team Class"); s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED");
        return sessions.save(s).getId();
    }
}
