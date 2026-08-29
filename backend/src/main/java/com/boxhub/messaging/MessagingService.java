package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * The ONE place message rows and the thread's denormalised columns are written together, so they
 * cannot drift (A1.3), and the ONE place the member<->member security rule lives (A1.2).
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

    /**
     * A1.2: the superseded design made "no athlete<->athlete" STRUCTURAL by having no path ids at
     * all. Naming a recipient reintroduces the wire, so the guarantee is now this rule — and the
     * cross-member-denied tests are the only thing holding it. @TenantId cannot help: both sides of
     * an athlete<->athlete leak sit in the same box, so the tenant filter passes it.
     */
    public Membership assertMayMessage(Membership actor, UUID targetMembershipId) {
        Membership target = memberships.findByIdAndBoxId(targetMembershipId, TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
        if (actor.getId().equals(target.getId()))
            throw new AccessDeniedException("Cannot message yourself");
        if ("ATHLETE".equals(actor.getRole())
                && !"COACH".equals(target.getRole()) && !"BOX_ADMIN".equals(target.getRole()))
            throw new AccessDeniedException("Athletes may only message staff");
        return target;
    }

    /** Resolve, never create. For the GET paths — a GET must not write. */
    public java.util.Optional<MessageThread> findThread(UUID a, UUID b) {
        UUID lo = lo(a, b), hi = hi(a, b);
        return threads.findByMemberLoIdAndMemberHiId(lo, hi);
    }

    /** Finds or creates the pair's thread. Only send() may call this. */
    @Transactional
    MessageThread threadFor(UUID a, UUID b) {
        UUID lo = lo(a, b), hi = hi(a, b);
        return threads.findByMemberLoIdAndMemberHiId(lo, hi).orElseGet(() -> {
            MessageThread t = new MessageThread();
            t.setMemberLoId(lo);
            t.setMemberHiId(hi);
            return threads.save(t);
        });
    }

    @Transactional
    public Message send(Membership actor, Membership target, String body) {
        MessageThread t = threadFor(actor.getId(), target.getId());
        Instant now = Instant.now();

        Message m = new Message();
        m.setThreadId(t.getId());
        m.setSenderMembershipId(actor.getId());
        m.setBody(body.trim());
        messages.save(m);

        t.setLastMessageAt(now);
        t.setLastSenderMembershipId(actor.getId());
        // The sender has, by definition, read their own message.
        t.setLastReadFor(actor.getId(), now);
        threads.save(t);
        return m;
    }

    /**
     * Marks an EXISTING thread read. Deliberately does not create one: no thread means nothing was
     * ever said, so there is nothing unread to clear — and creating here would fill the
     * conversation list with ghost threads for anyone the caller merely opened.
     */
    @Transactional
    public void markRead(Membership actor, UUID targetId) {
        findThread(actor.getId(), targetId).ifPresent(t -> {
            t.setLastReadFor(actor.getId(), Instant.now());
            threads.save(t);
        });
    }

    /** The caller's own membership in the box they are acting in. Never from a request param. */
    public Membership callerMembership() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }

    /**
     * Ordered to match Postgres's uuid comparison (unsigned byte-wise), NOT java.util.UUID's
     * compareTo (signed long comparison of the two 64-bit halves) — the two disagree whenever the
     * high bit of a UUID's first 8 bytes is set, which is roughly half of all random v4 UUIDs, and
     * that mismatch is exactly what tripped V31's member_lo_id < member_hi_id check constraint
     * during implementation. String form compares byte-for-byte because every byte is two lowercase
     * hex chars at a fixed position, so char ordering equals byte-value ordering.
     */
    private static UUID lo(UUID a, UUID b) { return a.toString().compareTo(b.toString()) < 0 ? a : b; }
    private static UUID hi(UUID a, UUID b) { return a.toString().compareTo(b.toString()) < 0 ? b : a; }
}
