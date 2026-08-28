package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The staff shared inbox (D-1, D-3). Addressed by membershipId rather than thread id so opening a
 * NEW conversation needs no separate create call — the thread is created lazily on first send.
 *
 * Every method calls RoleGuard.requireStaff(). That is not politeness: SecurityConfig:87 gates
 * /api/box/** at SCOPE_box alone, so this call IS the access control. AuthzConformanceTest probe
 * (c) fires an ATHLETE token at every route declared stricter than ATHLETE and requires 403, so a
 * forgotten guard here is a BUILD FAILURE, not a latent hole.
 */
@RestController
@RequestMapping("/api/box/threads")
public class StaffInboxController {

    private final MessagingService messaging;
    private final MessageThreadRepository threads;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public StaffInboxController(MessagingService messaging, MessageThreadRepository threads,
                                MessageRepository messages, MembershipRepository memberships) {
        this.messaging = messaging;
        this.threads = threads;
        this.messages = messages;
        this.memberships = memberships;
    }

    public record InboxRow(UUID membershipId, String memberName, String lastMessagePreview,
                           Instant lastMessageAt, boolean needsReply) {}
    record SendRequest(@NotBlank @Size(max = 4000) String body) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<InboxRow> inbox() {
        RoleGuard.requireStaff();
        return threads.findAllByOrderByLastMessageAtDesc().stream()
                .map(t -> new InboxRow(
                        t.getMembershipId(),
                        memberships.findById(t.getMembershipId())
                                .map(m -> m.getUser().getName()).orElse(null),
                        preview(t.getId()),
                        t.getLastMessageAt(),
                        t.needsReply()))
                .toList();
    }

    /**
     * Resolve, never create. threadFor() saves, and a GET must not write: otherwise a staff member
     * merely OPENING a member's conversation creates a thread row, and the shared inbox — which
     * lists threads — fills with empty conversations nobody ever started. Mirrors
     * MyThreadController.get() on the member side (Task 3).
     */
    @GetMapping("/{membershipId}")
    @Transactional(readOnly = true)
    public MyThreadController.ThreadDto thread(@PathVariable UUID membershipId) {
        RoleGuard.requireStaff();
        Membership target = requireMemberOfThisBox(membershipId);
        return threads.findByMembershipId(target.getId())
                .map(t -> new MyThreadController.ThreadDto(t.getId(), render(t.getId()), t.getStaffLastReadAt()))
                .orElseGet(() -> new MyThreadController.ThreadDto(null, List.of(), null));
    }

    @PostMapping("/{membershipId}/messages")
    @Transactional
    public MyThreadController.MessageDto send(@PathVariable UUID membershipId,
                                              @Valid @RequestBody SendRequest req) {
        RoleGuard.requireStaff();
        Membership target = requireMemberOfThisBox(membershipId);
        Membership me = messaging.callerMembership();
        Message m = messaging.send(target.getId(), me.getId(), Message.STAFF, req.body());
        return new MyThreadController.MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                me.getUser().getName(), m.getCreatedAt());
    }

    @PostMapping("/{membershipId}/read")
    @Transactional
    public void read(@PathVariable UUID membershipId) {
        RoleGuard.requireStaff();
        // ONE shared marker (D-3): this clears the thread for the whole staff, by design.
        messaging.markRead(requireMemberOfThisBox(membershipId).getId(), true);
    }

    /**
     * Membership is NOT @TenantId, so it is not box-filtered for us — an id from another box would
     * otherwise resolve. Check the box explicitly. Never trust an id from a request param.
     */
    private Membership requireMemberOfThisBox(UUID membershipId) {
        return memberships.findById(membershipId)
                .filter(m -> m.getBox().getId().equals(com.boxhub.shared.TenantContext.requireBoxId()))
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }

    private String preview(UUID threadId) {
        List<Message> all = messages.findByThreadIdOrderByCreatedAtAsc(threadId);
        if (all.isEmpty()) return null;
        String body = all.getLast().getBody();
        return body.length() <= 120 ? body : body.substring(0, 120);
    }

    private List<MyThreadController.MessageDto> render(UUID threadId) {
        return messages.findByThreadIdOrderByCreatedAtAsc(threadId).stream()
                .map(m -> new MyThreadController.MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                        memberships.findById(m.getSenderMembershipId())
                                .map(x -> x.getUser().getName()).orElse(null),
                        m.getCreatedAt()))
                .toList();
    }
}
