package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** Append-only: no update/delete method is declared here, and none should be added. */
public interface SuperadminAuditRepository extends JpaRepository<SuperadminAudit, UUID> {
    List<SuperadminAudit> findAllByOrderByCreatedAtDesc();
}
