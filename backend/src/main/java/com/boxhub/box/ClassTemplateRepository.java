package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ClassTemplateRepository extends JpaRepository<ClassTemplate, UUID> {
    List<ClassTemplate> findByActiveTrue();
}
