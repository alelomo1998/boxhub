package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.UUID;
public interface PostRepository extends JpaRepository<Post, UUID> {
    List<Post> findByAuthorMembershipIdOrderByCreatedAtDesc(UUID authorMembershipId);

    /**
     * Boxless GDPR export — see BookingRepository#findByMembershipIdForExport in com.boxhub.box.
     * Post is @TenantId, so the derived method above resolves NO_TENANT on GET /api/me/export's
     * boxless session. Safe natively: author_membership_id is a per-box key, so the row set
     * cannot cross a box boundary. docs/TENANCY.md §6.
     */
    @Query(value = "select * from post where author_membership_id = :mid order by created_at desc",
           nativeQuery = true)
    List<Post> findByAuthorMembershipIdForExport(@Param("mid") UUID authorMembershipId);
}
