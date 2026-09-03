package com.boxhub.notify;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The only way a notification is created.
 *
 * <p><b>Propagation.MANDATORY is the point.</b> CLAUDE.md's rule is that mail fires strictly after
 * commit while an audit row is written strictly inside the transaction, and an in-app notification
 * is an audit row, not a mail: a rolled-back waitlist promotion must erase its own "you're in".
 * MANDATORY makes that structural — emitting outside a transaction throws
 * IllegalTransactionStateException at the call site instead of quietly writing a row that survives
 * a rollback. Do not relax it to REQUIRED "so the job works"; give the job a transaction.
 *
 * <p><b>Tenancy.</b> Notification is @TenantId, so box_id is populated from the ambient tenant on
 * insert. Every caller must therefore already be under a real box: a request thread has one from
 * the JWT, and a job or webhook must be inside TenantContext.runAsBox(boxId, ...) installed BEFORE
 * the transaction opened. Never emit under runAsRoot — the row would take the sentinel box_id and
 * be invisible to the person it was written for.
 */
@Service
public class NotificationService {

    private final NotificationRepository notifications;
    private final NotificationPrefRepository prefs;

    public NotificationService(NotificationRepository notifications, NotificationPrefRepository prefs) {
        this.notifications = notifications;
        this.prefs = prefs;
    }

    /** One recipient. Silently does nothing if the member has the type switched off (D-8). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void emit(NotificationType type, UUID membershipId, Map<String, Object> params) {
        emitAll(type, List.of(membershipId), params);
    }

    /**
     * Fan-out. The preference lookup is ONE query for the whole audience — a class cancellation
     * with twenty on the roster must not cost twenty preference reads (the N+1 shape this codebase
     * has shipped before, on GET /api/box/me/announcements).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void emitAll(NotificationType type, Collection<UUID> membershipIds, Map<String, Object> params) {
        if (membershipIds == null || membershipIds.isEmpty()) return;
        Map<String, Object> safeParams = params == null ? Map.of() : params;

        Set<UUID> recipients = enabledFor(type, membershipIds);
        if (recipients.isEmpty()) return;

        String dedupeKey = type.dedupeKey(safeParams);
        String link = type.link(safeParams);
        UUID sourceId = type.sourceId(safeParams);

        for (UUID membershipId : recipients) {
            if (dedupeKey != null
                    && notifications.existsByMembershipIdAndTypeAndDedupeKey(membershipId, type.name(), dedupeKey)) {
                continue;
            }
            Notification n = new Notification();
            n.setMembershipId(membershipId);
            n.setType(type.name());
            n.setParams(new HashMap<>(safeParams));
            n.setLink(link);
            n.setSourceId(sourceId);
            n.setDedupeKey(dedupeKey);
            notifications.save(n);
        }
    }

    /**
     * Who among these members has this type switched on. A mandatory type is on for everybody and
     * skips the query entirely; otherwise an absent pref row means the type's own default, which is
     * what keeps notification_pref sparse and free of backfills.
     */
    private Set<UUID> enabledFor(NotificationType type, Collection<UUID> membershipIds) {
        if (type.mandatory()) return Set.copyOf(membershipIds);

        Map<UUID, Boolean> overrides = prefs
                .findByMembershipIdInAndTypeAndChannel(membershipIds, type.name(), NotificationChannel.IN_APP.name())
                .stream()
                .collect(Collectors.toMap(NotificationPref::getMembershipId, NotificationPref::isEnabled, (a, b) -> a));

        return membershipIds.stream()
                .filter(id -> overrides.getOrDefault(id, type.defaultOn()))
                .collect(Collectors.toSet());
    }
}
