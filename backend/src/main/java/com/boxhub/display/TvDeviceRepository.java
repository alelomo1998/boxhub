package com.boxhub.display;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TvDeviceRepository extends JpaRepository<TvDevice, UUID> {
    Optional<TvDevice> findByPairingCode(String pairingCode);
    List<TvDevice> findByBoxIdOrderByCreatedAtAsc(UUID boxId);
}
