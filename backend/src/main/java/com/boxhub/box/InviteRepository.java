package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface InviteRepository extends JpaRepository<Invite, UUID> {
    // Native (not JPQL) so the @TenantId discriminator filter does NOT apply:
    // invites are looked up by unguessable token hash regardless of the caller's active box.
    @Query(value = "select * from invites where token_hash = :h", nativeQuery = true)
    Optional<Invite> findByTokenHash(@Param("h") String tokenHash);

    // clearAutomatically: drop the stale in-context Invite (acceptedAt still null) so any
    // later re-read in the same tx sees the burned state.
    // Native for the same reason as findByTokenHash: JPQL bulk updates on a @TenantId
    // entity are filtered to the caller's active box, which would burn 0 rows for a
    // cross-box invite accept.
    @Modifying(clearAutomatically = true)
    @Query(value = "update invites set accepted_at = :now where id = :id and accepted_at is null",
            nativeQuery = true)
    int burnIfUnaccepted(@Param("id") UUID id, @Param("now") Instant now);

    // Native for the same reason as findByTokenHash/burnIfUnaccepted: a JPQL/derived bulk
    // delete on a @TenantId entity is filtered to the ambient tenant. PurgeJob runs from the
    // nightly scheduler with no per-box authentication at all, so a JPQL version resolves to
    // the all-zeros root tenant and deletes 0 rows in every box instead of sweeping all of
    // them — confirmed by a negative-control test in PurgeJobTest (see task-10-report.md).
    @Modifying
    @Query(value = "delete from invites where (accepted_at is not null and accepted_at < :cutoff) "
            + "or expires_at < :cutoff", nativeQuery = true)
    int purgeAcceptedOrExpired(@Param("cutoff") Instant cutoff);
}
