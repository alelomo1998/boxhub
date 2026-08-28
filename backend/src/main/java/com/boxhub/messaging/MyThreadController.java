package com.boxhub.messaging;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The member's own thread. NO PATH IDS ANYWHERE (spec §4, countermeasure 3): the membership is
 * resolved from the JWT, so there is nothing in the URL to tamper with and no member can name
 * another member. This is what makes "no member<->member" structural rather than a rule.
 */
@RestController
@RequestMapping("/api/box/me/thread")
public class MyThreadController {

    private final MessagingService messaging;
    private final MessageRepository messages;
    private final MembershipRepository memberships;

    public MyThreadController(MessagingService messaging, MessageRepository messages,
                              MembershipRepository memberships) {
        this.messaging = messaging;
        this.messages = messages;
        this.memberships = memberships;
    }

    public record MessageDto(UUID id, String body, String senderSide, String senderName, Instant createdAt) {}
    public record ThreadDto(UUID id, List<MessageDto> messages, Instant memberLastReadAt) {}
    record SendRequest(@NotBlank @Size(max = 4000) String body) {}

    /** Always 200, never 204 (spec §6): "no thread yet" is an empty state, not a missing resource. */
    @GetMapping
    @Transactional(readOnly = true)
    public ThreadDto get() {
        Membership me = messaging.callerMembership();
        MessageThread t = messaging.threadFor(me.getId());
        return new ThreadDto(t.getId(), render(t.getId()), t.getMemberLastReadAt());
    }

    @PostMapping("/messages")
    @Transactional
    public MessageDto send(@Valid @RequestBody SendRequest req) {
        Membership me = messaging.callerMembership();
        Message m = messaging.send(me.getId(), me.getId(), Message.MEMBER, req.body());
        return new MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                me.getUser().getName(), m.getCreatedAt());
    }

    @PostMapping("/read")
    @Transactional
    public void read() {
        messaging.markRead(messaging.callerMembership().getId(), false);
    }

    private List<MessageDto> render(UUID threadId) {
        return messages.findByThreadIdOrderByCreatedAtAsc(threadId).stream()
                .map(m -> new MessageDto(m.getId(), m.getBody(), m.getSenderSide(),
                        memberships.findById(m.getSenderMembershipId())
                                .map(x -> x.getUser().getName()).orElse(null),
                        m.getCreatedAt()))
                .toList();
    }
}
