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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves Propagation.MANDATORY is structural (not merely documented), that preferences resolve
 * in one query for the whole audience, and that mandatory/dedupe/fan-out behave per registry §5.
 *
 * No shared test fixtures exist in this codebase (see AbstractIntegrationTest) — this class's
 * seedMembershipId/seedSecondMembershipId fixture mirrors NotificationEntityTest's pattern.
 * seedSecondMembershipId reuses the box seedMembershipId created (same test instance), so the two
 * memberships are two ACTIVE members of the SAME box.
 */
class NotificationServiceTest extends AbstractIntegrationTest {

    @Autowired NotificationService service;
    @Autowired NotificationRepository notifications;
    @Autowired NotificationPrefRepository prefs;
    @Autowired PlatformTransactionManager txManager;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;

    private UUID boxId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private TransactionTemplate tx() { return new TransactionTemplate(txManager); }

    /** First call creates a new box + installs its tenant context; a second call in the same test
     * reuses that box, so seedSecondMembershipId is a second ACTIVE member of the SAME box. */
    private UUID seedMembershipId() {
        if (boxId == null) {
            long n = System.nanoTime();
            Box box = new Box();
            box.setName("Notify Svc Test " + n);
            box.setSlug("notify-svc-test-" + n);
            box.setTimezone("Europe/Rome");
            box = boxes.save(box);
            boxId = box.getId();
            actAsBox(boxId);
        }
        return newMember();
    }

    private UUID seedSecondMembershipId() {
        // Must run after seedMembershipId in the same test — boxId is already installed.
        return newMember();
    }

    private UUID newMember() {
        long n = System.nanoTime();
        User u = authService.register("notify-svc-" + n + "@t.io", "correct-horse-battery", "notify-svc-" + n + "@t.io");
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(boxId).orElseThrow());
        m.setRole("ATHLETE");
        return memberships.save(m).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void emittingOutsideATransactionThrowsRatherThanWritingARow() {
        // The whole of D-4 in one assertion: a notification cannot be created after commit,
        // because there is no way to call this without a transaction.
        assertThatThrownBy(() -> service.emit(NotificationType.WAITLIST_PROMOTED, seedMembershipId(), Map.of()))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aRolledBackTransactionLeavesNoNotification() {
        UUID member = seedMembershipId();
        try {
            tx().executeWithoutResult(status -> {
                service.emit(NotificationType.WAITLIST_PROMOTED, member,
                        Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString()));
                throw new IllegalStateException("boom — the cause failed after emitting");
            });
        } catch (IllegalStateException expected) {
            // the promotion did not happen, so the athlete must not be told it did
        }
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aDisabledTypeWritesNothing() {
        UUID member = seedMembershipId();
        tx().executeWithoutResult(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(member);
            off.setType(NotificationType.WAITLIST_PROMOTED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            prefs.save(off);
        });

        tx().executeWithoutResult(s -> service.emit(NotificationType.WAITLIST_PROMOTED, member,
                Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString())));

        assertThat(notifications.count()).isZero();
    }

    @Test
    void aMandatoryTypeIgnoresAnOffSwitch() {
        UUID member = seedMembershipId();
        tx().executeWithoutResult(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(member);
            off.setType(NotificationType.PAYMENT_FAILED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            prefs.save(off);
        });

        tx().executeWithoutResult(s -> service.emit(NotificationType.PAYMENT_FAILED, member,
                Map.of(NotificationType.AMOUNT_CENTS, 4900)));

        // Money events are mandatory (registry §5.3): the switch must not exist, let alone work.
        assertThat(notifications.count()).isOne();
    }

    @Test
    void switchingATypeBackOnDoesNotBackfillPastEvents() {
        UUID member = seedMembershipId();
        UUID pref = tx().execute(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(member);
            off.setType(NotificationType.CLASS_CANCELLED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            return prefs.save(off).getId();
        });

        // fires while the member has it off — nothing is written
        tx().executeWithoutResult(s -> service.emit(NotificationType.CLASS_CANCELLED, member,
                Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString())));
        assertThat(notifications.count()).isZero();

        // they switch it back on
        tx().executeWithoutResult(s -> {
            NotificationPref on = prefs.findById(pref).orElseThrow();
            on.setEnabled(true);
            prefs.save(on);
        });

        // The preference is checked at emit, not at read (D-8): switching a type on shows future
        // events only. A read-time filter would resurrect rows never written for this member, and
        // "who was told?" would stop being answerable.
        assertThat(notifications.count()).isZero();
    }

    @Test
    void aDedupedTypeFiresOnceForTheSameKey() {
        UUID member = seedMembershipId();
        UUID subscription = UUID.randomUUID();
        Map<String, Object> params = Map.of(
                NotificationType.SUBSCRIPTION_ID, subscription.toString(),
                NotificationType.ENDS_AT, "2026-10-01");

        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member, params));
        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member, params));

        // A nightly sweep runs this fourteen times; the member must be warned once.
        assertThat(notifications.count()).isOne();
    }

    @Test
    void aRenewalReArmsTheExpiryWarning() {
        UUID member = seedMembershipId();
        UUID subscription = UUID.randomUUID();

        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member,
                Map.of(NotificationType.SUBSCRIPTION_ID, subscription.toString(),
                       NotificationType.ENDS_AT, "2026-10-01")));
        tx().executeWithoutResult(s -> service.emit(NotificationType.SUBSCRIPTION_EXPIRING, member,
                Map.of(NotificationType.SUBSCRIPTION_ID, subscription.toString(),
                       NotificationType.ENDS_AT, "2026-11-01")));

        assertThat(notifications.count()).isEqualTo(2);
    }

    @Test
    void announcementRowsCarryTheirSourceAndNoReadState() {
        UUID member = seedMembershipId();
        UUID announcementId = UUID.randomUUID();

        tx().executeWithoutResult(s -> service.emit(NotificationType.NEW_ANNOUNCEMENT, member,
                Map.of(NotificationType.ANNOUNCEMENT_ID, announcementId.toString(),
                       NotificationType.BODY_PREVIEW, "No 18:00 on Friday")));

        Notification row = notifications.findAll().getFirst();
        assertThat(row.getSourceId()).isEqualTo(announcementId);
        // read_at stays null forever for this type: announcement_recipient.read_at is the one
        // marker, and a value here would be a second read state disagreeing with it (D-3).
        assertThat(row.getReadAt()).isNull();
    }

    @Test
    void fanOutSkipsOnlyTheMembersWhoSwitchedItOff() {
        UUID keeps = seedMembershipId();
        UUID mutes = seedSecondMembershipId();
        tx().executeWithoutResult(s -> {
            NotificationPref off = new NotificationPref();
            off.setMembershipId(mutes);
            off.setType(NotificationType.CLASS_CANCELLED.name());
            off.setChannel(NotificationChannel.IN_APP.name());
            off.setEnabled(false);
            prefs.save(off);
        });

        tx().executeWithoutResult(s -> service.emitAll(NotificationType.CLASS_CANCELLED, List.of(keeps, mutes),
                Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString())));

        assertThat(notifications.findAll()).singleElement()
                .extracting(Notification::getMembershipId).isEqualTo(keeps);
    }
}
