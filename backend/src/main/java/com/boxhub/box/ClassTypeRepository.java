package com.boxhub.box;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClassTypeRepository extends JpaRepository<ClassType, UUID> {
    List<ClassType> findAllByOrderByName();
    Optional<ClassType> findByName(String name);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from ClassType t where t.id = :id")
    Optional<ClassType> findWithLockById(@Param("id") UUID id);
}
