package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A1.4: replaces MyThreadController + StaffInboxController. Athlete and staff perform the same
 * operations here; the only difference is who they may address, and that lives in exactly one
 * place, MessagingService.assertMayMessage — see A1.2. Two controllers duplicating that rule is
 * a rule that drifts.
 */
@RestController
public class ConversationController {

    private final MessagingService messaging;
    private final MessageThreadRepository threads;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public ConversationController(MessagingService messaging, MessageThreadRepository threads,
                                  MessageRepository messages, MembershipRepository memberships) {
        this.messaging = messaging;
        this.threads = threads;
        this.messages = messages;
        this.memberships = memberships;
    }

    public record MessageDto(UUID id, String body, UUID senderMembershipId, String senderName,
                             Instant createdAt, boolean mine) {}
    public record ContactDto(UUID membershipId, String name, String role, String avatarPath) {}
    public record ConversationDto(UUID membershipId, String name, String role, String avatarPath,
                                  String lastMessagePreview, Instant lastMessageAt,
                                  long unreadCount, boolean needsReply) {}
    public record ConversationDetailDto(UUID membershipId, String name, String role,
                                        String avatarPath, List<MessageDto> messages) {}
    record SendRequest(@NotBlank @Size(max = 4000) String body) {}

    /** People the caller may message. Athlete -> staff only; staff -> everyone in the box. */
    @GetMapping("/api/box/contacts")
    @Transactional(readOnly = true)
    public List<ContactDto> contacts(@RequestParam(required = false) String search) {
        Membership me = messaging.callerMembership();
        boolean athlete = "ATHLETE".equals(me.getRole());
        String s = (search == null || search.isBlank()) ? null : search.trim();
        return memberships.searchByBox(TenantContext.requireBoxId(), s, PageRequest.of(0, 200))
                .stream()
                .filter(m -> !m.getId().equals(me.getId()))
                .filter(m -> !athlete || "COACH".equals(m.getRole()) || "BOX_ADMIN".equals(m.getRole()))
                .map(m -> new ContactDto(m.getId(), m.getUser().getName(), m.getRole(), m.getAvatarPath()))
                .toList();
    }

    /** The caller's threads, newest first. */
    @GetMapping("/api/box/conversations")
    @Transactional(readOnly = true)
    public List<ConversationDto> list() {
        Membership me = messaging.callerMembership();
        return threads.findAllForMember(me.getId()).stream()
                .map(t -> toConversationDto(t, me.getId()))
                .toList();
    }

    /** One conversation. Resolve, never create — a GET must not write. */
    @GetMapping("/api/box/conversations/{membershipId}")
    @Transactional(readOnly = true)
    public ConversationDetailDto get(@PathVariable UUID membershipId) {
        Membership me = messaging.callerMembership();
        Membership target = messaging.assertMayMessage(me, membershipId);
        List<MessageDto> body = messaging.findThread(me.getId(), target.getId())
                .map(t -> render(t.getId(), me.getId()))
                .orElseGet(List::of);
        return new ConversationDetailDto(target.getId(), target.getUser().getName(),
                target.getRole(), target.getAvatarPath(), body);
    }

    @PostMapping("/api/box/conversations/{membershipId}/messages")
    @Transactional
    public MessageDto send(@PathVariable UUID membershipId, @Valid @RequestBody SendRequest req) {
        Membership me = messaging.callerMembership();
        Membership target = messaging.assertMayMessage(me, membershipId);
        Message m = messaging.send(me, target, req.body());
        return new MessageDto(m.getId(), m.getBody(), m.getSenderMembershipId(),
                me.getUser().getName(), m.getCreatedAt(), true);
    }

    /** No-ops when no thread exists — opening a conversation that never started leaves nothing. */
    @PostMapping("/api/box/conversations/{membershipId}/read")
    @Transactional
    public void read(@PathVariable UUID membershipId) {
        Membership me = messaging.callerMembership();
        Membership target = messaging.assertMayMessage(me, membershipId);
        messaging.markRead(me, target.getId());
    }

    private ConversationDto toConversationDto(MessageThread t, UUID me) {
        UUID counterpartId = t.counterpart(me);
        Membership counterpart = memberships.findById(counterpartId).orElse(null);
        Instant since = t.lastReadFor(me) == null ? Instant.EPOCH : t.lastReadFor(me);
        long unread = messages.countUnread(t.getId(), since, me);
        return new ConversationDto(counterpartId,
                counterpart == null ? null : counterpart.getUser().getName(),
                counterpart == null ? null : counterpart.getRole(),
                counterpart == null ? null : counterpart.getAvatarPath(),
                preview(t.getId()), t.getLastMessageAt(), unread, t.needsReplyFor(me));
    }

    private String preview(UUID threadId) {
        List<Message> all = messages.findByThreadIdOrderByCreatedAtAsc(threadId);
        if (all.isEmpty()) return null;
        String body = all.getLast().getBody();
        return body.length() <= 120 ? body : body.substring(0, 120);
    }

    private List<MessageDto> render(UUID threadId, UUID me) {
        return messages.findByThreadIdOrderByCreatedAtAsc(threadId).stream()
                .map(m -> new MessageDto(m.getId(), m.getBody(), m.getSenderMembershipId(),
                        memberships.findById(m.getSenderMembershipId())
                                .map(x -> x.getUser().getName()).orElse(null),
                        m.getCreatedAt(), m.getSenderMembershipId().equals(me)))
                .toList();
    }
}
