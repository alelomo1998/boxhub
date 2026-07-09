package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface WodRepository extends JpaRepository<Wod, UUID> {
    List<Wod> findByOrderByUpdatedAtDesc();
    List<Wod> findByTitleContainingIgnoreCaseOrderByUpdatedAtDesc(String title);
}
