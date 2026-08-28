package com.boxhub.messaging;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessageThreadRepository extends JpaRepository<MessageThread, UUID> {

    /**
     * THE member-scoped finder (spec §4). @TenantId box-filters this; the membershipId predicate is
     * what stops member B reading member A's thread — both are in the same box, so the tenant filter
     * passes either way. Never replace this with findAll() and a filter in the caller.
     */
    Optional<MessageThread> findByMembershipId(UUID membershipId);

    /**
     * The staff shared inbox. Box-filtered by @TenantId and reachable only behind
     * RoleGuard.requireStaff(), so returning every thread in the box IS the intent here.
     * Deliberately not named findAll() — that name is a banned grep for this package.
     */
    List<MessageThread> findAllByOrderByLastMessageAtDesc();
}
