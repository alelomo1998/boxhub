package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BoxStripeRepository extends JpaRepository<BoxStripe, UUID> {
    Optional<BoxStripe> findByBoxId(UUID boxId);
}
