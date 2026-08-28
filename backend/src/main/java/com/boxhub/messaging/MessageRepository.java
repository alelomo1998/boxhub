package com.boxhub.messaging;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    /** Callers must already have proved the thread belongs to the caller. */
    List<Message> findByThreadIdOrderByCreatedAtAsc(UUID threadId);
}
