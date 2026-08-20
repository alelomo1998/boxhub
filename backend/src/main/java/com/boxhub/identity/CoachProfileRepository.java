package com.boxhub.identity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface CoachProfileRepository extends JpaRepository<CoachProfile, UUID> {
    List<CoachProfile> findByPublishedTrue();
    void deleteByUserId(UUID userId);
}
