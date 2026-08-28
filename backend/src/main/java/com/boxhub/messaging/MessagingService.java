package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * The ONE place message rows and the thread's denormalised columns are written together, so they
 * cannot drift (spec §3). Nothing else may set lastMessageAt or lastMessageFromStaff.
 */
@Service
public class MessagingService {

    private final MessageThreadRepository threads;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public MessagingService(MessageThreadRepository threads, MessageRepository messages,
                            MembershipRepository memberships) {
        this.threads = threads;
        this.messages = messages;
        this.memberships = memberships;
    }

    /** One thread per member per box (D-1). Created lazily on first send, by either side. */
    @Transactional
    public MessageThread threadFor(UUID membershipId) {
        return threads.findByMembershipId(membershipId).orElseGet(() -> {
            MessageThread t = new MessageThread();
            t.setMembershipId(membershipId);
            return threads.save(t);
        });
    }

    @Transactional
    public Message send(UUID membershipId, UUID senderMembershipId, String side, String body) {
        MessageThread t = threadFor(membershipId);
        Instant now = Instant.now();

        Message m = new Message();
        m.setThreadId(t.getId());
        m.setSenderMembershipId(senderMembershipId);
        // Frozen at send: a promotion later must not rewrite who this came from.
        m.setSenderSide(side);
        m.setBody(body.trim());
        messages.save(m);

        t.setLastMessageAt(now);
        t.setLastMessageFromStaff(Message.STAFF.equals(side));
        // The sender has, by definition, read their own message.
        if (Message.STAFF.equals(side)) t.setStaffLastReadAt(now); else t.setMemberLastReadAt(now);
        threads.save(t);
        return m;
    }

    /**
     * Marks an EXISTING thread read. Deliberately does not create one: no thread means nothing was
     * ever said, so there is nothing unread to clear — and the frontend calls this on screen open,
     * so creating here would fill the staff inbox with ghost threads.
     */
    @Transactional
    public void markRead(UUID membershipId, boolean staffSide) {
        threads.findByMembershipId(membershipId).ifPresent(t -> {
            if (staffSide) t.setStaffLastReadAt(Instant.now()); else t.setMemberLastReadAt(Instant.now());
            threads.save(t);
        });
    }

    /** The caller's own membership in the box they are acting in. Never from a request param. */
    public Membership callerMembership() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "Not a member of this box"));
    }
}
