package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface PostRepository extends JpaRepository<Post, UUID> {
    List<Post> findByAuthorMembershipIdOrderByCreatedAtDesc(UUID authorMembershipId);
}
