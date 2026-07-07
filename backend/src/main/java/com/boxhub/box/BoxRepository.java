package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface BoxRepository extends JpaRepository<Box, UUID> {
}
