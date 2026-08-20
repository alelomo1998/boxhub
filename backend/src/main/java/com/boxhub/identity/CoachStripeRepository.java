package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface CoachStripeRepository extends JpaRepository<CoachStripe, UUID> {
    void deleteByUserId(UUID userId);
}
