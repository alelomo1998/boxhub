package com.boxhub.performance;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
public interface PostLikeRepository extends JpaRepository<PostLike, UUID> {
    List<PostLike> findByUserId(UUID userId);
    long countByPostId(UUID postId);
}
