package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface ClassTypeRepository extends JpaRepository<ClassType, UUID> {
    List<ClassType> findAllByOrderByName();
}
