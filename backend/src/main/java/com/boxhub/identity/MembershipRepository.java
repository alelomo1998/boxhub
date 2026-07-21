package com.boxhub.identity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {

    @Query("select m from Membership m join fetch m.box where m.user.id = :userId")
    List<Membership> findByUserIdWithBox(@Param("userId") UUID userId);

    Optional<Membership> findByUserIdAndBoxId(UUID userId, UUID boxId);

    @Query("""
        select m from Membership m join fetch m.user where m.box.id = :boxId
          and (:search is null or lower(m.user.name) like lower(concat('%', cast(:search as string), '%'))
               or lower(m.user.email) like lower(concat('%', cast(:search as string), '%')))
        order by m.user.name
        """)
    Page<Membership> searchByBox(
            @Param("boxId") UUID boxId, @Param("search") String search, Pageable pageable);

    long countByBoxIdAndRoleAndStatus(UUID boxId, String role, String status);

    @Query("select m from Membership m join fetch m.user where m.id = :id and m.box.id = :boxId")
    Optional<Membership> findByIdAndBoxId(@Param("id") UUID id, @Param("boxId") UUID boxId);

    // Membership is not @TenantId — derived query safe tenant-agnostically.
    Optional<Membership> findFirstByBoxIdAndRole(UUID boxId, String role);

    // Join-fetch so callers can read m.getUser() after this method's own transaction has closed
    // (open-in-view is false) — used by mail-sending code (PaymentReceipts, SubscriptionLapseJob)
    // that runs strictly after a DB commit, outside any request-scoped session.
    @Query("select m from Membership m join fetch m.user where m.id = :id")
    Optional<Membership> findByIdWithUser(@Param("id") UUID id);
}
