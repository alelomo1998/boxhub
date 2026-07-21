package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {
    Optional<Subscription> findByMembershipIdAndStatus(UUID membershipId, String status);
    List<Subscription> findByStatusAndCurrentPeriodEndBefore(String status, Instant cutoff);
    // Most-recent subscription regardless of status. Used only to satisfy payment.subscription_id
    // (NOT NULL) when a lapsed member starts a renewal checkout — the webhook re-resolves the real
    // subscription on success. Subscription is @TenantId; this in-box derived query is correctly scoped.
    Optional<Subscription> findFirstByMembershipIdOrderByCreatedAtDesc(UUID membershipId);
}
