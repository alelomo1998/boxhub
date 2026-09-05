package com.boxhub.notify;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationTypeTest {

    @Test
    void everyFeedTypeExceptAnnouncementsHasALink() {
        // A feed row with no link is a row that cannot be opened. NEW_ANNOUNCEMENT is the one
        // deliberate exception: it opens a sheet in place.
        for (NotificationType t : NotificationType.values()) {
            if (!t.showsInFeed() || t == NotificationType.NEW_ANNOUNCEMENT) continue;
            Map<String, Object> params = Map.of(NotificationType.SESSION_ID, UUID.randomUUID().toString());
            assertThat(t.link(params)).as("link for %s", t).isNotBlank();
        }
    }

    @Test
    void classLinksPointAtTheAthleteClassDetailRoute() {
        UUID sessionId = UUID.randomUUID();
        assertThat(NotificationType.WAITLIST_PROMOTED.link(Map.of(NotificationType.SESSION_ID, sessionId.toString())))
                .isEqualTo("/athlete/class/" + sessionId);
    }

    @Test
    void expiringDedupeKeyChangesWhenThePeriodEndChanges() {
        UUID sub = UUID.randomUUID();
        String first = NotificationType.SUBSCRIPTION_EXPIRING.dedupeKey(
                Map.of(NotificationType.SUBSCRIPTION_ID, sub.toString(), NotificationType.ENDS_AT, "2026-10-01"));
        String afterRenewal = NotificationType.SUBSCRIPTION_EXPIRING.dedupeKey(
                Map.of(NotificationType.SUBSCRIPTION_ID, sub.toString(), NotificationType.ENDS_AT, "2026-11-01"));

        // Same key would suppress the warning forever after one send; a renewal must re-arm it.
        assertThat(first).isNotEqualTo(afterRenewal);
    }

    @Test
    void onlyTwoTypesDedupe() {
        for (NotificationType t : NotificationType.values()) {
            String key = t.dedupeKey(Map.of(NotificationType.SESSION_ID, "s",
                    NotificationType.SUBSCRIPTION_ID, "x", NotificationType.ENDS_AT, "y"));
            boolean expected = t == NotificationType.SUBSCRIPTION_EXPIRING || t == NotificationType.CLASS_STARTING_SOON;
            assertThat(key != null).as("dedupes: %s", t).isEqualTo(expected);
        }
    }

    @Test
    void messagesAndRemindersAreNotInTheFeed() {
        assertThat(NotificationType.feedTypeNames())
                .doesNotContain(NotificationType.NEW_MESSAGE.name(), NotificationType.CLASS_STARTING_SOON.name())
                .hasSize(12);
    }

    @Test
    void mandatoryTypesAreExactlyTheMoneyAndAccessOnes() {
        assertThat(java.util.Arrays.stream(NotificationType.values())
                .filter(NotificationType::mandatory).map(Enum::name).toList())
                .containsExactlyInAnyOrder("SUBSCRIPTION_EXPIRING", "PAYMENT_FAILED", "MEMBERSHIP_BLOCKED");
    }

    @Test
    void everyDeclaredTypeIsOnByDefault() {
        // PR_CONGRATULATED, the one opt-in event, is deferred to M25 because nothing creates a
        // PostLike yet. defaultOn stays on the enum regardless: registry §5.3 requires every event
        // to declare a default, and M27c/M32b will add types that start off.
        assertThat(java.util.Arrays.stream(NotificationType.values())
                .filter(t -> !t.defaultOn()).toList()).isEmpty();
    }
}
