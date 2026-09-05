package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.AnnouncementService;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.HomeController;
import com.boxhub.box.MyAnnouncementsController;
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
import java.util.HashMap;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * There is ONE read marker per announcement. These two tests are the reason M29b was designed the
 * way it was: without them a second marker could be introduced and nothing would go red until a
 * real athlete read an announcement in one place and saw it unread in the other.
 */
class ReadStateDelegationTest extends AbstractIntegrationTest {

    @Autowired NotificationController feed;
    @Autowired NotificationRepository notificationsRepository;
    @Autowired HomeController home;
    @Autowired MyAnnouncementsController myAnnouncements;
    @Autowired AnnouncementService announcements;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;

    private UUID boxId;
    private UUID adminUserId;
    private Membership me;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(userId.toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "ATHLETE")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    /** Fresh box + fresh membership, once per test — every assertion in this class is scoped to it. */
    private void ensureSeeded() {
        if (boxId != null) return;
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Notify RSD " + n);
        b.setSlug("notify-rsd-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        boxId = boxes.save(b).getId();

        User admin = authService.register("rsd-admin-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Admin");
        adminUserId = admin.getId();

        User athlete = authService.register("rsd-mem-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Athlete");
        Membership m = new Membership();
        m.setUser(athlete);
        m.setBox(b);
        m.setRole("ATHLETE");
        me = memberships.save(m);
    }

    private record Seeded(UUID announcementId) {}

    /** Sends as the admin (a real users(id), which announcement.sent_by requires), then leaves the
     *  security context set as "me" — every test's next call is a feed/home read as the athlete. */
    private Seeded seedAnnouncementSentToMe() {
        ensureSeeded();
        actAsBox(adminUserId);
        var sent = announcements.send("No 18:00 class on Friday", "EVERYONE", null);
        actAsBox(me.getUser().getId());
        return new Seeded(sent.getId());
    }

    private void seedWaitlistPromotionNotificationForMe() {
        ensureSeeded();
        actAsBox(me.getUser().getId());
        Notification n = new Notification();
        n.setMembershipId(me.getId());
        n.setType(NotificationType.WAITLIST_PROMOTED.name());
        n.setParams(new HashMap<>());
        notificationsRepository.save(n);
    }

    @Test
    void readingAnAnnouncementFromTheFeedDropsTheHomeCardBadge() {
        seedAnnouncementSentToMe();
        assertThat(home.home().announcementUnread()).isOne();

        var rows = feed.list(null).rows();
        assertThat(rows).hasSize(1);
        var row = rows.stream()
                .filter(r -> NotificationType.NEW_ANNOUNCEMENT.name().equals(r.type())).findFirst().orElseThrow();
        assertThat(row.read()).isFalse();
        feed.read(row.id());

        // Same column. If this fails, a second read state has been introduced.
        assertThat(home.home().announcementUnread()).isZero();
        assertThat(feed.unreadCount().count()).isZero();
    }

    @Test
    void readingAnAnnouncementFromHomeMarksTheFeedRowRead() {
        var seeded = seedAnnouncementSentToMe();

        myAnnouncements.read(seeded.announcementId());

        var rows = feed.list(null).rows();
        assertThat(rows).hasSize(1);
        var row = rows.stream()
                .filter(r -> NotificationType.NEW_ANNOUNCEMENT.name().equals(r.type())).findFirst().orElseThrow();
        assertThat(row.read()).isTrue();
        assertThat(feed.unreadCount().count()).isZero();
    }

    @Test
    void markAllReadClearsAnnouncementsToo() {
        seedAnnouncementSentToMe();
        seedWaitlistPromotionNotificationForMe();
        assertThat(feed.unreadCount().count()).isEqualTo(2);

        feed.readAll();

        // Announcements are not on the notification row's read_at, so a loop over notifications
        // alone would leave the bell showing 1 forever.
        assertThat(feed.unreadCount().count()).isZero();
        assertThat(home.home().announcementUnread()).isZero();
    }

    @Test
    void anAnnouncementNotificationNeverStoresItsOwnReadState() {
        seedAnnouncementSentToMe();
        var rows = feed.list(null).rows();
        assertThat(rows).hasSize(1);
        var row = rows.getFirst();

        feed.read(row.id());

        assertThat(notificationsRepository.findById(row.id()).orElseThrow().getReadAt())
                .as("the delegating row must stay null — a value here IS the second marker")
                .isNull();
    }
}
