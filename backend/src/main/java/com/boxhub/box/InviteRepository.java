package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface InviteRepository extends JpaRepository<Invite, UUID> {
    Optional<Invite> findByTokenHash(String tokenHash);

    @Modifying
    @Query("update Invite i set i.acceptedAt = :now where i.id = :id and i.acceptedAt is null")
    int burnIfUnaccepted(@Param("id") UUID id, @Param("now") Instant now);
}
