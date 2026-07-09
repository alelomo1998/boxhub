package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TrackRepository extends JpaRepository<Track, UUID> {
    List<Track> findByArchivedFalseOrderBySortOrderAsc();
    boolean existsByName(String name);
}
