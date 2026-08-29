package com.boxhub.messaging;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "message")
public class Message {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "thread_id", nullable = false) private UUID threadId;
    // Ownership is senderMembershipId == viewer; A1.3 dropped V30's stored senderSide as a dead
    // field (the same defect MemberController documents for planId).
    @Column(name = "sender_membership_id", nullable = false) private UUID senderMembershipId;
    @Column(nullable = false) private String body;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getThreadId() { return threadId; }
    public void setThreadId(UUID threadId) { this.threadId = threadId; }
    public UUID getSenderMembershipId() { return senderMembershipId; }
    public void setSenderMembershipId(UUID v) { this.senderMembershipId = v; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public Instant getCreatedAt() { return createdAt; }
}
