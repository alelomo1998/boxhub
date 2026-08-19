package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface WodRatingRepository extends JpaRepository<WodRating, UUID> {
    List<WodRating> findByUserId(UUID userId);
}
