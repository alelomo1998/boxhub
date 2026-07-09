package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface BenchmarkTemplateRepository extends JpaRepository<BenchmarkTemplate, UUID> {
    List<BenchmarkTemplate> findAllByOrderByKindAscNameAsc();
    List<BenchmarkTemplate> findByKindOrderByNameAsc(String kind);
}
