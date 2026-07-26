package com.boxhub.display;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TvDeviceRepository extends JpaRepository<TvDevice, UUID> {
    Optional<TvDevice> findByPairingCode(String pairingCode);
    List<TvDevice> findByBoxIdOrderByCreatedAtAsc(UUID boxId);

    // TvDevice is deliberately NOT @TenantId (pairing happens before a tenant exists), so a
    // plain derived bulk delete is correct here — no native SQL needed, see docs/TENANCY.md.
    int deleteByStatusAndCreatedAtBefore(String status, Instant cutoff);
}
