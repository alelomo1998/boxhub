package com.boxhub.messaging;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MessageThreadRepository extends JpaRepository<MessageThread, UUID> {

    /**
     * The pair finder (A1.3). Callers must already have normalised lo/hi (lo < hi) — see
     * MessagingService.threadFor. @TenantId box-filters this.
     */
    Optional<MessageThread> findByMemberLoIdAndMemberHiId(UUID lo, UUID hi);

    /**
     * The caller's own conversation list, newest first. Box-filtered by @TenantId; the (lo = :me or
     * hi = :me) predicate is what stops one member reading another's list — both are in the same
     * box, so the tenant filter passes either way. Never replace with findAll() and a filter in the
     * caller — that name is a banned grep for this package.
     */
    @Query("""
        select t from MessageThread t
         where t.memberLoId = :me or t.memberHiId = :me
         order by t.lastMessageAt desc nulls last
        """)
    List<MessageThread> findAllForMember(@Param("me") UUID me);
}
