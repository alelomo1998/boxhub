package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.AnnouncementService;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.Plan;
import com.boxhub.box.PlanRepository;
import com.boxhub.box.SubscriptionService;
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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AnnouncementNotificationTest extends AbstractIntegrationTest {

    @Autowired AnnouncementService announcements;
    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    /**
     * Subject is a REAL user id, unlike BookingNotificationTest's random one: the 3-arg send()
     * resolves TenantContext.userId() as sentBy, and announcement.sent_by is a real FK into
     * users(id) (V7 renamed from updated_by). A random subject would fail that FK the moment a
     * test reaches the 3-arg overload.
     */
    private void actAsBox(UUID boxId, UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(userId.toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID seedBox() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Notify Ann " + n);
        b.setSlug("notify-ann-" + n);
        b.setTimezone("Europe/Rome");
        b.setCancelCutoffMin(120);
        UUID boxId = boxes.save(b).getId();

        User admin = authService.register("ann-admin-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Admin");
        actAsBox(boxId, admin.getId());
        return boxId;
    }

    private UUID newActiveMembership(UUID boxId) {
        long n = System.nanoTime();
        User u = authService.register("ann-mem-" + n + "-" + Math.random() + "@t.io",
                "correct-horse-battery", "Athlete");
        Box box = boxes.findById(boxId).orElseThrow();
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId(); // status field-defaults to ACTIVE
    }

    private record TwoMembers(List<UUID> membershipIds) {}

    /** SegmentResolver.EVERYONE only requires membership.status == "ACTIVE" (the field default). */
    private TwoMembers seedTwoActiveMembers() {
        UUID boxId = seedBox();
        return new TwoMembers(List.of(newActiveMembership(boxId), newActiveMembership(boxId)));
    }

    /**
     * EXPIRING flags an ACTIVE member only when they hold an active subscription whose
     * currentPeriodEnd falls inside SegmentResolver.EXPIRING_SOON_DAYS (14). A 60-day plan recorded
     * from Instant.now() keeps both members comfortably outside that window without depending on
     * wall-clock timing between seed and assertion.
     */
    private TwoMembers seedTwoActiveMembersWithNoExpiringSubscriptions() {
        UUID boxId = seedBox();
        Plan plan = new Plan();
        plan.setName("Long plan " + System.nanoTime());
        plan.setDurationDays(60);
        UUID planId = plans.save(plan).getId();

        UUID m1 = newActiveMembership(boxId);
        UUID m2 = newActiveMembership(boxId);
        subscriptionService.recordPeriod(m1, planId, 0, "test");
        subscriptionService.recordPeriod(m2, planId, 0, "test");
        return new TwoMembers(List.of(m1, m2));
    }

    @Test
    void sendingAnAnnouncementNotifiesItsFrozenAudience() {
        var audience = seedTwoActiveMembers();

        var sent = announcements.send("No 18:00 class on Friday", "EVERYONE", null);

        var rows = notifications.findAll();
        assertThat(rows).hasSize(2);
        assertThat(rows)
                .allSatisfy(n -> {
                    assertThat(n.getType()).isEqualTo(NotificationType.NEW_ANNOUNCEMENT.name());
                    // The delegation, asserted at the source: this row must never own read state.
                    assertThat(n.getReadAt()).isNull();
                    assertThat(n.getSourceId()).isEqualTo(sent.getId());
                })
                .extracting(Notification::getMembershipId)
                .containsExactlyInAnyOrderElementsOf(audience.membershipIds());
    }

    @Test
    void theRowCarriesAPreviewAndASenderSoTheFeedNeedsNoSecondFetch() {
        seedTwoActiveMembers();

        announcements.send("Short body", "EVERYONE", null);

        var rows = notifications.findAll();
        assertThat(rows).hasSize(2);
        assertThat(rows.getFirst().getParams())
                .containsEntry(NotificationType.BODY_PREVIEW, "Short body")
                .containsKey(NotificationType.SENT_BY_NAME);
    }

    @Test
    void aLongBodyIsTruncatedToThePreviewLength() {
        seedTwoActiveMembers();
        String longBody = "x".repeat(400);

        announcements.send(longBody, "EVERYONE", null);

        var rows = notifications.findAll();
        assertThat(rows).hasSize(2);
        String preview = (String) rows.getFirst().getParams().get(NotificationType.BODY_PREVIEW);
        assertThat(preview).hasSize(NotificationType.BODY_PREVIEW_CHARS);
    }

    @Test
    void aSystemSendCarriesANullSenderRatherThanAPlaceholder() {
        seedTwoActiveMembers();

        // The four-argument form with sentBy = null: V30's backfill and seed sends both do this,
        // and it is legitimate. The frontend renders "Your gym"; the row must not bake that in,
        // or the string would be untranslatable and wrong for a box that renames itself.
        announcements.send("From the system", "EVERYONE", null, null);

        var rows = notifications.findAll();
        assertThat(rows).hasSize(2);
        assertThat(rows.getFirst().getParams()).doesNotContainKey(NotificationType.SENT_BY_NAME);
    }

    @Test
    void anAnnouncementToNobodyNotifiesNobody() {
        // EXPIRING with no expiring members resolves to an empty audience.
        seedTwoActiveMembersWithNoExpiringSubscriptions();

        announcements.send("Renew soon", "EXPIRING", null);

        assertThat(notifications.count()).isZero();
    }
}
