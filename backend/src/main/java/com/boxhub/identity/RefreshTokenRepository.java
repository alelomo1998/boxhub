package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    boolean existsByFamilyIdAndUserId(UUID familyId, UUID userId);

    @Query("""
            select t from RefreshToken t
            where t.user.id = :userId and t.consumedAt is null and t.revokedAt is null
              and t.expiresAt > :now
            order by t.lastUsedAt desc nulls last
            """)
    List<RefreshToken> findActiveByUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.familyId = :familyId and t.revokedAt is null")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.user.id = :userId and t.revokedAt is null")
    int revokeAllForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :cutoff or t.revokedAt is not null or t.consumedAt < :cutoff")
    int purge(@Param("cutoff") Instant cutoff);

    void deleteByUserId(UUID userId);
}
