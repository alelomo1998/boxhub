package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface BoxPhotoRepository extends JpaRepository<BoxPhoto, UUID> {
    List<BoxPhoto> findByBoxIdOrderBySortOrder(UUID boxId);
    List<BoxPhoto> findByBoxIdInOrderBySortOrder(Collection<UUID> boxIds);
}
