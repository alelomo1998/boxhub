package com.boxhub.identity;

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
}
