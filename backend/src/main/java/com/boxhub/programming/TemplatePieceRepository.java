package com.boxhub.programming;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TemplatePieceRepository extends JpaRepository<TemplatePiece, UUID> {
    List<TemplatePiece> findByTemplateIdOrderBySortOrderAsc(UUID templateId);
    void deleteByTemplateId(UUID templateId);
}
