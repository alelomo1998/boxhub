package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface BoxRepository extends JpaRepository<Box, UUID> {
    boolean existsBySlug(String slug);
    long countByStatusIn(java.util.Collection<String> statuses);
    long countByStatus(String status);
    java.util.List<Box> findByStatusOrderByCreatedAtAsc(String status);
    java.util.List<Box> findAllByOrderByCreatedAtDesc();
}
