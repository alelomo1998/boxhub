package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
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

import java.time.Instant;
import java.util.HashMap;
import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The feed API: happy + auth-denied + cross-tenant-denied for all four endpoints, plus paging and
 * the feed-exclusion rule. Isolation is a fresh box + fresh membership per test (AbstractIntegrationTest
 * shares one Postgres container with no rollback), so every assertion here is scoped to `me`.
 */
class NotificationApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired NotificationRepository notificationsRepository;
    @Autowired NotificationController feed;

    Box box, otherBox;
    User u, uo;
    Membership me, otherBoxMember;
    String myToken, otherToken;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        box = newBox("Notif " + n, "notif-" + n);
        otherBox = newBox("ForeignNotif " + n, "fnotif-" + n);

        u = authService.register("na-" + n + "@t.io", "correct-horse-battery", "Ada");
        uo = authService.register("no-" + n + "@t.io", "correct-horse-battery", "Otto");

        me = member(u, box, "ATHLETE");
        otherBoxMember = member(uo, otherBox, "BOX_ADMIN");

        myToken = tokenService.boxToken(u, me);
        otherToken = tokenService.boxToken(uo, otherBoxMember);
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

    // ───────────────────────── seeding: direct repository writes under a synthetic tenant ─────────────────────────

    private void actAsBox(UUID boxId, UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(userId.toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID seedNotificationFor(Membership member, UUID actingBoxId, UUID actingUserId, NotificationType type) {
        actAsBox(actingBoxId, actingUserId);
        Notification n = new Notification();
        n.setMembershipId(member.getId());
        n.setType(type.name());
        n.setParams(new HashMap<>());
        UUID id = notificationsRepository.save(n).getId();
        SecurityContextHolder.clearContext();
        return id;
    }

    private UUID seedNotificationForMe(NotificationType type) {
        return seedNotificationFor(me, box.getId(), u.getId(), type);
    }

    // ───────────────────────── GET /api/box/notifications ─────────────────────────

    @Test
    void listHappy() throws Exception {
        seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(get("/api/box/notifications").header("Authorization", "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].type").value("WAITLIST_PROMOTED"))
                .andExpect(jsonPath("$.rows[0].read").value(false));
    }

    @Test
    void listAnonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/notifications")).andExpect(status().isUnauthorized());
    }

    @Test
    void listCrossTenantDenied() throws Exception {
        seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        // A foreign box's own token must see its own (empty) feed, never a row addressed to a
        // membership in someone else's box.
        mvc.perform(get("/api/box/notifications").header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(0));
    }

    @Test
    void remindersAndMessagesNeverAppearInTheFeed() {
        seedNotificationForMe(NotificationType.CLASS_STARTING_SOON);

        actAsBox(box.getId(), u.getId());
        assertThat(feed.list(null).rows()).isEmpty();
    }

    @Test
    void pagingReturnsEveryRowExactlyOnce() {
        // 31 rows written at the SAME Instant, which is what emitAll does for a class cancellation.
        // Without the (createdAt, id) tiebreak in the keyset query the page boundary silently loses
        // or repeats a row.
        actAsBox(box.getId(), u.getId());
        Instant fixed = Instant.now();
        for (int i = 0; i < 31; i++) {
            Notification n = new Notification();
            n.setMembershipId(me.getId());
            n.setType(NotificationType.WAITLIST_PROMOTED.name());
            n.setParams(new HashMap<>());
            n.setCreatedAt(fixed);
            notificationsRepository.save(n);
        }

        var first = feed.list(null);
        var second = feed.list(first.nextCursor());

        assertThat(first.rows()).hasSize(30);
        assertThat(second.rows()).hasSize(1);
        assertThat(second.nextCursor()).isNull();
        assertThat(Stream.concat(first.rows().stream(), second.rows().stream())
                .map(NotificationController.FeedRow::id).distinct()).hasSize(31);
    }

    // ───────────────────────── GET /api/box/notifications/unread-count ─────────────────────────

    @Test
    void unreadCountHappy() throws Exception {
        seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(get("/api/box/notifications/unread-count").header("Authorization", "Bearer " + myToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void unreadCountAnonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/notifications/unread-count")).andExpect(status().isUnauthorized());
    }

    @Test
    void unreadCountCrossTenantDenied() throws Exception {
        seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(get("/api/box/notifications/unread-count").header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0));
    }

    // ───────────────────────── POST /api/box/notifications/{id}/read ─────────────────────────

    @Test
    void readHappy() throws Exception {
        UUID id = seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(post("/api/box/notifications/" + id + "/read").with(csrf())
                        .header("Authorization", "Bearer " + myToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/notifications/unread-count").header("Authorization", "Bearer " + myToken))
                .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void readAnonymousIsRejected() throws Exception {
        mvc.perform(post("/api/box/notifications/" + UUID.randomUUID() + "/read").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void readCrossTenantDenied() throws Exception {
        UUID id = seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(post("/api/box/notifications/" + id + "/read").with(csrf())
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void aMemberCannotMarkAnotherMembersNotificationRead() throws Exception {
        Membership otherMemberSameBox = member(
                authService.register("na2-" + System.nanoTime() + "-" + Math.random() + "@t.io",
                        "correct-horse-battery", "Bo"),
                box, "ATHLETE");
        UUID theirs = seedNotificationFor(otherMemberSameBox, box.getId(), u.getId(), NotificationType.WAITLIST_PROMOTED);

        mvc.perform(post("/api/box/notifications/" + theirs + "/read").with(csrf())
                        .header("Authorization", "Bearer " + myToken))
                .andExpect(status().isNotFound());   // never 403 — it must not confirm the row exists
    }

    // ───────────────────────── POST /api/box/notifications/read-all ─────────────────────────

    @Test
    void readAllHappy() throws Exception {
        seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(post("/api/box/notifications/read-all").with(csrf())
                        .header("Authorization", "Bearer " + myToken))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/notifications/unread-count").header("Authorization", "Bearer " + myToken))
                .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void readAllAnonymousIsRejected() throws Exception {
        mvc.perform(post("/api/box/notifications/read-all").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void readAllCrossTenantDenied() throws Exception {
        seedNotificationForMe(NotificationType.WAITLIST_PROMOTED);

        mvc.perform(post("/api/box/notifications/read-all").with(csrf())
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isOk());

        // Untouched by the foreign box's read-all.
        mvc.perform(get("/api/box/notifications/unread-count").header("Authorization", "Bearer " + myToken))
                .andExpect(jsonPath("$.count").value(1));
    }
}
