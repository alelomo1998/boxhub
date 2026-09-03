package com.boxhub.notify;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

/** The member's own notification preferences. Member-scoped; no id selects a person. */
@RestController
@RequestMapping("/api/box/me/notification-prefs")
public class NotificationPrefController {

    private final NotificationPrefRepository prefs;
    private final MembershipRepository memberships;

    public NotificationPrefController(NotificationPrefRepository prefs, MembershipRepository memberships) {
        this.prefs = prefs;
        this.memberships = memberships;
    }

    /**
     * The EFFECTIVE state, not the stored one. notification_pref is sparse — most members have no
     * rows at all — so returning stored rows would render every switch off for a new member and
     * make the whole page a lie. `mandatory` tells the page to render a locked control with a
     * reason rather than a switch that silently does nothing.
     */
    public record PrefRow(String type, String channel, boolean enabled, boolean mandatory) {}
    public record PrefUpdate(String type, String channel, boolean enabled) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<PrefRow> mine() {
        UUID me = me().getId();
        Map<String, Boolean> stored = prefs.findByMembershipId(me).stream()
                .collect(Collectors.toMap(p -> p.getType() + "/" + p.getChannel(),
                                          NotificationPref::isEnabled, (a, b) -> a));

        // Only the types a person can actually see. NEW_MESSAGE and CLASS_STARTING_SOON are
        // declared but deliver nothing in-app, and a switch that controls nothing is worse than
        // an absent one — they appear when M27c gives them a channel.
        return Arrays.stream(NotificationType.values())
                .filter(NotificationType::showsInFeed)
                .map(t -> new PrefRow(t.name(), NotificationChannel.IN_APP.name(),
                        t.mandatory() || stored.getOrDefault(
                                t.name() + "/" + NotificationChannel.IN_APP.name(), t.defaultOn()),
                        t.mandatory()))
                .toList();
    }

    @PutMapping
    @Transactional
    public List<PrefRow> save(@RequestBody List<PrefUpdate> updates) {
        UUID me = me().getId();
        for (PrefUpdate u : updates) {
            NotificationType type = parse(u.type());
            // A mandatory type has no switch on the page; a request to turn one off is either a
            // stale client or someone poking the API, and both deserve a refusal rather than a
            // silently ignored write that the UI would then render as success.
            if (type.mandatory()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "MANDATORY_NOTIFICATION");
            }
            if (!NotificationChannel.IN_APP.name().equals(u.channel())) {
                // PUSH and SMS exist in the enum for M27c and M32b; neither delivers yet, so a
                // stored preference for them would be a promise this build cannot keep.
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CHANNEL_NOT_AVAILABLE");
            }
            NotificationPref row = prefs
                    .findByMembershipIdAndTypeAndChannel(me, type.name(), u.channel())
                    .orElseGet(() -> {
                        NotificationPref fresh = new NotificationPref();
                        fresh.setMembershipId(me);
                        fresh.setType(type.name());
                        fresh.setChannel(u.channel());
                        return fresh;
                    });
            row.setEnabled(u.enabled());
            prefs.save(row);
        }
        return mine();
    }

    private static NotificationType parse(String type) {
        try {
            return NotificationType.valueOf(type);
        } catch (IllegalArgumentException unknown) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UNKNOWN_NOTIFICATION_TYPE");
        }
    }

    private Membership me() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }
}
