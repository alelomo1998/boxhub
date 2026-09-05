package com.boxhub.notify;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationPrefRepository extends JpaRepository<NotificationPref, UUID> {

    Optional<NotificationPref> findByMembershipIdAndTypeAndChannel(UUID membershipId, String type, String channel);

    /** The fan-out path. One query for twenty recipients, never one lookup per recipient. */
    List<NotificationPref> findByMembershipIdInAndTypeAndChannel(Collection<UUID> membershipIds,
                                                                String type, String channel);

    List<NotificationPref> findByMembershipId(UUID membershipId);
}
