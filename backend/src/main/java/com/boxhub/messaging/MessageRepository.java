package com.boxhub.messaging;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface MessageRepository extends JpaRepository<Message, UUID> {
    /** Callers must already have proved the thread belongs to the caller. */
    List<Message> findByThreadIdOrderByCreatedAtAsc(UUID threadId);

    /**
     * Unread count for the viewer: messages in the thread strictly after `since`, not sent by them.
     * Callers pass Instant.EPOCH for "never read" rather than null — Postgres cannot infer a type
     * for a bind parameter used only inside an "IS NULL OR ..." branch (surfaced as "could not
     * determine data type of parameter" at runtime, not at compile time).
     */
    @Query("""
        select count(m) from Message m
         where m.threadId = :threadId and m.createdAt > :since and m.senderMembershipId <> :me
        """)
    long countUnread(@Param("threadId") UUID threadId, @Param("since") Instant since,
                     @Param("me") UUID me);
}
