package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BoxWaitlistRepository extends JpaRepository<BoxWaitlist, UUID> {
    boolean existsByEmail(String email);
    List<BoxWaitlist> findAllByOrderByCreatedAtAsc();
}
