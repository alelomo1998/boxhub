package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves two things that fail loudly and confusingly if wrong: the jsonb round-trip on
 * {@code params}, and that {@code @TenantId} populates {@code box_id} on insert.
 *
 * No shared test fixtures exist in this codebase (see AbstractIntegrationTest) — this class's
 * {@code seedMembershipId}/{@code currentBoxId} fixture mirrors HomeSurfaceApiTest's
 * newBox/member/actAsBox pattern, trimmed to what these two tests need.
 */
class NotificationEntityTest extends AbstractIntegrationTest {

    @Autowired NotificationRepository notifications;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;

    private UUID boxId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    /** New box + one ACTIVE membership, with the box-scoped tenant context installed for it. */
    private UUID seedMembershipId() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Notify Test " + n);
        box.setSlug("notify-test-" + n);
        box.setTimezone("Europe/Rome");
        box = boxes.save(box);
        boxId = box.getId();
        actAsBox(boxId);

        User u = authService.register("notify-" + n + "@t.io", "correct-horse-battery", "notify-" + n + "@t.io");
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private UUID currentBoxId() { return boxId; }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void paramsRoundTripThroughJsonb() {
        UUID sessionId = UUID.randomUUID();
        Notification n = new Notification();
        n.setMembershipId(seedMembershipId());
        n.setType(NotificationType.WAITLIST_PROMOTED.name());
        n.setParams(Map.of("sessionId", sessionId.toString(), "className", "6:00 WOD"));
        notifications.saveAndFlush(n);

        Notification found = notifications.findById(n.getId()).orElseThrow();

        assertThat(found.getParams()).containsEntry("className", "6:00 WOD");
        assertThat(found.getParams()).containsEntry("sessionId", sessionId.toString());
    }

    @Test
    void tenantIdPopulatesBoxIdOnInsert() {
        Notification n = new Notification();
        n.setMembershipId(seedMembershipId());
        n.setType(NotificationType.WAITLIST_PROMOTED.name());
        notifications.saveAndFlush(n);

        // Not merely non-null: it must be THIS box, or the row is invisible to its own reader.
        assertThat(notifications.findById(n.getId()).orElseThrow().getBoxId()).isEqualTo(currentBoxId());
    }
}
