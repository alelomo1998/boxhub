package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.UUID;

public interface WodRepository extends JpaRepository<Wod, UUID>, JpaSpecificationExecutor<Wod> {
    List<Wod> findByOrderByUpdatedAtDesc();
    List<Wod> findByTitleContainingIgnoreCaseOrderByUpdatedAtDesc(String title);

    // The LIBRARY, which is not the same set as "every wod row": since M14c-a a class owns a
    // private copy of each piece it programmes (library = false), and listing those would fill the
    // picker with one entry per class. Derived queries are right here -- Wod is @TenantId, so
    // Hibernate box-filters them automatically, which is exactly what this read wants.
    List<Wod> findByLibraryTrueOrderByUpdatedAtDesc();
    List<Wod> findByLibraryTrueAndTitleContainingIgnoreCaseOrderByUpdatedAtDesc(String title);

    // The box's own saved copies of global benchmarks (library = true; a class's own attached copy
    // is library = false and never belongs here) -- keyed by benchmarkTemplateId in LibraryController
    // to tell "already copied" from "still global".
    List<Wod> findByLibraryTrueAndBenchmarkTemplateIdIsNotNull();
}
