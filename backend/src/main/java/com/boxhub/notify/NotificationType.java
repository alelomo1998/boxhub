package com.boxhub.notify;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Every event the product fires. This enum IS the registry's §4 table in code — icon, feed
 * visibility, default state and policy are declared here and nowhere else, which is why there is
 * no DB check constraint on notification.type: adding an event is a row in docs/NOTIFICATIONS.md
 * plus a constant here, never a migration (M29b D-5).
 *
 * <p><b>Links are static per type, not per recipient.</b> Athlete-facing types link into
 * /athlete/**, which roleGuard admits ATHLETE, COACH and BOX_ADMIN to — so a coach who booked a
 * class follows the same link an athlete does, with no role lookup at emit time. The two
 * staff-facing types link into /admin/**, and both are addressed to box admins only.
 */
public enum NotificationType {
    //                        icon               feed   default  mandatory
    WAITLIST_PROMOTED       ("check",            true,  true,    false),
    CLASS_CANCELLED         ("x",                true,  true,    false),
    CLASS_TIME_CHANGED      ("calendar",         true,  true,    false),
    COACH_CHANGED           ("user",             true,  true,    false),
    LATE_CANCEL_UNREFUNDED  ("triangle-alert",   true,  true,    false),
    NO_SHOW_RECORDED        ("circle-alert",     true,  true,    false),
    NEW_ANNOUNCEMENT        ("mail",             true,  true,    false),
    SUBSCRIPTION_EXPIRING   ("credit-card",      true,  true,    true),
    PAYMENT_FAILED          ("triangle-alert",   true,  true,    true),
    MEMBERSHIP_BLOCKED      ("lock",             true,  true,    true),
    INVITE_ACCEPTED         ("user",             true,  true,    false),
    NEW_MEMBER_JOINED       ("users",            true,  true,    false),

    /**
     * Scheduled by ClassReminderScheduler and shown by nobody until M27c gives it a transport. The
     * row is written so the sweep is assertable and dedupe works; showsInFeed=false keeps it out of
     * the feed, because an in-app "starts in 1 hour" read at 9pm is noise (M29b D-11).
     */
    CLASS_STARTING_SOON     ("calendar",         false, true,    false),

    /**
     * The coach has posted the class's programming. The registry declared this off by default
     * against a bulk week-publish path that does not exist -- the builder publishes one session at
     * a time -- so it ships ON and opt-out, deduped per session (docs/NOTIFICATIONS.md §4.4,
     * amended 2026-09-07).
     */
    PROGRAMMING_PUBLISHED   ("clipboard-list",   true,  true,    false),

    /**
     * Declared so M27c has something to route push against. Emits NO row: bh-messages-envelope
     * already delivers this with its own badge and its own read marker, and a second copy in the
     * feed would mean two badges counting one message (M29b D-2).
     */
    NEW_MESSAGE             ("mail",             false, true,    false);

    // ---- param keys. Callers use these constants, never string literals. ----
    public static final String SESSION_ID = "sessionId";
    public static final String CLASS_NAME = "className";
    public static final String START_AT = "startAt";
    public static final String OLD_START_AT = "oldStartAt";
    public static final String NEW_START_AT = "newStartAt";
    public static final String COACH_NAME = "coachName";
    public static final String ANNOUNCEMENT_ID = "announcementId";
    public static final String BODY_PREVIEW = "bodyPreview";
    public static final String SENT_BY_NAME = "sentByName";
    public static final String SUBSCRIPTION_ID = "subscriptionId";
    public static final String PLAN_NAME = "planName";
    public static final String ENDS_AT = "endsAt";
    public static final String AMOUNT_CENTS = "amountCents";
    public static final String CURRENCY = "currency";
    public static final String INVITEE_NAME = "inviteeName";
    public static final String MEMBER_NAME = "memberName";

    /** Announcement bodies are user-written and arbitrarily long; the feed row shows a preview. */
    public static final int BODY_PREVIEW_CHARS = 140;

    private final String icon;
    private final boolean showsInFeed;
    private final boolean defaultOn;
    private final boolean mandatory;

    NotificationType(String icon, boolean showsInFeed, boolean defaultOn, boolean mandatory) {
        this.icon = icon;
        this.showsInFeed = showsInFeed;
        this.defaultOn = defaultOn;
        this.mandatory = mandatory;
    }

    public String icon() { return icon; }
    public boolean showsInFeed() { return showsInFeed; }
    public boolean defaultOn() { return defaultOn; }
    /** Money and account-security events have no toggle (registry §5.3). */
    public boolean mandatory() { return mandatory; }

    /** The types the feed query selects. Passed into the repository so this stays the one source. */
    public static List<String> feedTypeNames() {
        return Arrays.stream(values()).filter(NotificationType::showsInFeed).map(Enum::name).toList();
    }

    /** An app ROUTE path, never a URL — M27c resolves a push tap through the same router. */
    public String link(Map<String, Object> params) {
        return switch (this) {
            case WAITLIST_PROMOTED, CLASS_CANCELLED, CLASS_TIME_CHANGED, COACH_CHANGED,
                 LATE_CANCEL_UNREFUNDED, NO_SHOW_RECORDED, CLASS_STARTING_SOON,
                 PROGRAMMING_PUBLISHED ->
                    "/athlete/class/" + params.get(SESSION_ID);
            case SUBSCRIPTION_EXPIRING, PAYMENT_FAILED, MEMBERSHIP_BLOCKED -> "/athlete/membership";
            case INVITE_ACCEPTED, NEW_MEMBER_JOINED -> "/admin/members";
            // The feed opens an announcement in a sheet in place; there is no route to send it to.
            case NEW_ANNOUNCEMENT, NEW_MESSAGE -> null;
        };
    }

    /**
     * Non-null only where re-firing is a bug rather than a fact. A renewal legitimately re-arms
     * SUBSCRIPTION_EXPIRING because the period end is part of the key.
     */
    public String dedupeKey(Map<String, Object> params) {
        return switch (this) {
            case SUBSCRIPTION_EXPIRING -> params.get(SUBSCRIPTION_ID) + ":" + params.get(ENDS_AT);
            // A coach who fixes a typo and hits Save and republish must not re-notify the roster.
            case CLASS_STARTING_SOON, PROGRAMMING_PUBLISHED -> String.valueOf(params.get(SESSION_ID));
            default -> null;
        };
    }

    /** The announcement whose read marker this row delegates to (D-3). Null for every other type. */
    public UUID sourceId(Map<String, Object> params) {
        if (this != NEW_ANNOUNCEMENT) return null;
        Object raw = params.get(ANNOUNCEMENT_ID);
        return raw == null ? null : UUID.fromString(raw.toString());
    }
}
