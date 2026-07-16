package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailTokenRepository extends JpaRepository<EmailToken, UUID> {
    Optional<EmailToken> findByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from EmailToken t where t.user.id = :userId and t.type = :type and t.consumedAt is null")
    void deleteUnconsumedOfType(@Param("userId") UUID userId, @Param("type") String type);

    @Modifying
    @Query("delete from EmailToken t where t.expiresAt < :cutoff or t.consumedAt is not null")
    int purge(@Param("cutoff") Instant cutoff);

    void deleteByUserId(UUID userId);
}
