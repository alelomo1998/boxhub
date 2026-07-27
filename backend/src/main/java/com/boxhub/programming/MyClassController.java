package com.boxhub.programming;

import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.box.ClassTemplate;
import com.boxhub.box.ClassTemplateRepository;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.MediaSigner;
import com.boxhub.shared.TenantContext;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Athlete "WOD" tab: the caller's booked class today (else today's classes to browse). */
@RestController
@RequestMapping("/api/box/my-class-today")
public class MyClassController {

    private final ClassSessionRepository sessions;
    private final ClassTemplateRepository templates;
    private final BookingRepository bookings;
    private final MembershipRepository memberships;
    private final SessionItemRepository items;
    private final SessionItemController itemsApi; // dto mapping
    private final MediaSigner mediaSigner;

    public MyClassController(ClassSessionRepository sessions, ClassTemplateRepository templates,
                             BookingRepository bookings, MembershipRepository memberships,
                             SessionItemRepository items, SessionItemController itemsApi, MediaSigner mediaSigner) {
        this.sessions = sessions;
        this.templates = templates;
        this.bookings = bookings;
        this.memberships = memberships;
        this.items = items;
        this.itemsApi = itemsApi;
        this.mediaSigner = mediaSigner;
    }

    public record SessionRef(UUID id, String name, Instant startAt, String imagePath, String programmingStatus) {}
    public record MyClassDto(SessionRef session, boolean booked, List<SessionItemController.ItemDto> items,
                             List<SessionRef> otherToday) {}

    @GetMapping
    @Transactional(readOnly = true)
    public MyClassDto get() {
        UUID mid = memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member")).getId();

        ZoneId zone = ZoneId.systemDefault();
        Instant from = LocalDate.now(zone).atStartOfDay(zone).toInstant();
        Instant to = LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant();
        List<ClassSession> today = sessions.findByStartAtBetweenOrderByStartAt(from, to).stream()
                .filter(s -> !"CANCELLED".equals(s.getStatus())).toList();

        Map<UUID, String> images = templates.findAll().stream()
                .filter(t -> t.getImagePath() != null)
                .collect(Collectors.toMap(ClassTemplate::getId, ClassTemplate::getImagePath));

        ClassSession mine = today.stream()
                .filter(s -> bookings.findBySessionIdAndMembershipId(s.getId(), mid)
                        .map(b -> !"NO_SHOW".equals(b.getStatus())).orElse(false))
                .findFirst().orElse(null);

        ClassSession focus = mine != null ? mine : (today.size() == 1 ? today.get(0) : null);
        List<SessionItemController.ItemDto> focusItems = List.of();
        if (focus != null && "PUBLISHED".equals(focus.getProgrammingStatus())) {
            focusItems = itemsApi.toDtos(items.findBySessionIdOrderBySortOrderAsc(focus.getId()));
        }

        List<SessionRef> others = today.stream()
                .filter(s -> focus == null || !s.getId().equals(focus.getId()))
                .map(s -> ref(s, images)).toList();

        return new MyClassDto(focus == null ? null : ref(focus, images), mine != null, focusItems, others);
    }

    private SessionRef ref(ClassSession s, Map<UUID, String> images) {
        return new SessionRef(s.getId(), s.getName(), s.getStartAt(),
                mediaSigner.sign(s.getTemplateId() == null ? null : images.get(s.getTemplateId())),
                s.getProgrammingStatus());
    }
}
