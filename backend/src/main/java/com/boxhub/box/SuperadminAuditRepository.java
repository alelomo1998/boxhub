package com.boxhub.box;

import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Append-only, enforced by the TYPE rather than by asking nicely.
 * <p>
 * This extended {@code JpaRepository} until M12b, which meant it inherited {@code delete()},
 * {@code deleteAll()} and save-as-update, and "append-only" was a comment requesting that nobody
 * call them. Extending {@code Repository<>} instead means only the two methods declared here
 * exist at all — an audit row that can be deleted is not an audit row, and the compiler is a
 * better guarantee than a code comment.
 * <p>
 * If a future feature appears to need a delete, that is a retention policy, not a repository
 * method: design it deliberately (see the full-audit-log item in docs/BACKLOG.md) rather than
 * widening this interface back.
 */
public interface SuperadminAuditRepository extends Repository<SuperadminAudit, UUID> {

    SuperadminAudit save(SuperadminAudit row);

    List<SuperadminAudit> findAllByOrderByCreatedAtDesc();
}
