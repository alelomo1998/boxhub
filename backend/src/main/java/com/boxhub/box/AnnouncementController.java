package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.MediaSigner;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Staff surface: send an announcement to a segment, and read the history (D-4, D-8). */
@RestController
@RequestMapping("/api/box/announcements")
public class AnnouncementController {

    private final AnnouncementService service;
    private final AnnouncementRepository announcements;
    private final AnnouncementRecipientRepository recipients;
    private final ClassSessionRepository sessions;
    private final SegmentResolver segments;
    private final BookingRepository bookings;
    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final UserRepository users;
    private final MembershipRepository memberships;
    private final MediaSigner mediaSigner;

    public AnnouncementController(AnnouncementService service, AnnouncementRepository announcements,
                                  AnnouncementRecipientRepository recipients, ClassSessionRepository sessions,
                                  SegmentResolver segments, BookingRepository bookings, ScheduleSlotRepository slots,
                                  ClassTypeRepository types, UserRepository users, MembershipRepository memberships,
                                  MediaSigner mediaSigner) {
        this.service = service;
        this.announcements = announcements;
        this.recipients = recipients;
        this.sessions = sessions;
        this.segments = segments;
        this.bookings = bookings;
        this.slots = slots;
        this.types = types;
        this.users = users;
        this.memberships = memberships;
        this.mediaSigner = mediaSigner;
    }

    public record AnnouncementRow(UUID id, String body, String segment, Instant sentAt,
                                  long sentCount, long readCount) {}
    record SendRequest(@NotBlank @Size(max = 2000) String body, @NotBlank String segment, UUID segmentRef) {}

    /**
     * The picker card's data. bookedCount/waitlistCount are display counts; recipientCount is the
     * number that must agree with /preview for the SAME session (see targetRecipientCountMatchesPreviewForTheSameSession) —
     * it is deliberately NOT bookedCount + waitlistCount, which double-counts anyone holding two
     * rows for one session.
     */
    public record TargetSession(UUID id, String name, Instant startAt, String imagePath,
                                String coachName, long bookedCount, long waitlistCount,
                                long recipientCount) {}
    public record RecipientPreview(long count) {}
    public record RecipientRow(UUID membershipId, String name, String avatarPath, Instant readAt) {}
    public record ClassBrief(UUID id, String name, Instant startAt, String imagePath, String coachName) {}
    /** The whole detail sheet in one call: the announcement, its class (CLASS_ROSTER only), and who got it. */
    public record AnnouncementDetail(UUID id, String body, String segment, Instant sentAt,
                                     long sentCount, long readCount,
                                     ClassBrief clazz, List<RecipientRow> recipients) {}

    /** Coaches may send, not just admins (D-8): a coach cancelling their class needs no admin. */
    @PostMapping
    @Transactional
    public AnnouncementRow send(@Valid @RequestBody SendRequest req) {
        RoleGuard.requireStaff();
        assertMaySendToSegment(req.segment(), req.segmentRef());
        Announcement a = service.send(req.body(), req.segment(), req.segmentRef());
        return row(a);
    }

    /**
     * D-8, narrowed (product decision, 2026-08-29): admins remain unrestricted — any segment. A
     * COACH may send only to CLASS_ROSTER, and only for a session they are the assigned coach of —
     * the "cancelling their own 6am" case D-8 was written for, not a gym-wide EVERYONE broadcast or
     * an EXPIRING dunning message. Mirrors MessagingService.assertMayMessage: one named method, not
     * checks scattered across the handler.
     */
    private void assertMaySendToSegment(String segment, UUID segmentRef) {
        if ("BOX_ADMIN".equals(TenantContext.role())) return;

        if (!SegmentResolver.CLASS_ROSTER.equals(segment))
            throw new AccessDeniedException("Coaches may only announce to their own class roster");
        if (segmentRef == null)
            throw new AccessDeniedException("Coaches may only announce to their own class roster");

        // Box-scoped lookup, never a bare findById: a session id from another tenant must not leak
        // whether it exists, and must never be treated as "found".
        ClassSession session = sessions.findById(segmentRef)
                .filter(s -> TenantContext.requireBoxId().equals(s.getBoxId()))
                .orElseThrow(() -> new AccessDeniedException("Class session not found"));

        // Null coachId = unassigned session; no coach may announce to it, only an admin.
        if (session.getCoachId() == null || !session.getCoachId().equals(TenantContext.userId()))
            throw new AccessDeniedException("Coaches may only announce to a class they coach");
    }

    /**
     * The caller's OWN outbox, not the whole box's (product decision, 2026-08-31): a coach must not
     * see an admin's sends and vice versa. A pre-M29a/system row with a null sentBy belongs to
     * nobody's history and appears in neither — see AnnouncementRepository.findBySentByOrderBySentAtDesc.
     */
    @GetMapping
    @Transactional(readOnly = true)
    public List<AnnouncementRow> history() {
        RoleGuard.requireStaff();
        return announcements.findBySentByOrderBySentAtDesc(TenantContext.userId()).stream().map(this::row).toList();
    }

    /**
     * The picker's data source. The frontend cannot answer "is this my class?" on its own: an
     * ActiveBox carries only boxId/boxName/role, never the viewer's user id, and coachId on a
     * ClassSession is a USER id. So the server must return only the sessions the caller is actually
     * allowed to announce to — mirroring assertMaySendToSegment exactly, so the picker can never
     * offer a session the send would then 403 on.
     */
    @GetMapping("/targets")
    @Transactional(readOnly = true)
    public List<TargetSession> targets() {
        RoleGuard.requireStaff();
        Instant now = Instant.now();
        List<ClassSession> upcoming = sessions.findByStartAtBetweenOrderByStartAt(now, now.plus(14, ChronoUnit.DAYS));
        boolean isAdmin = "BOX_ADMIN".equals(TenantContext.role());
        List<ClassSession> visible = upcoming.stream()
                .filter(s -> !"CANCELLED".equals(s.getStatus()))
                .filter(s -> isAdmin || (s.getCoachId() != null && s.getCoachId().equals(TenantContext.userId())))
                .toList();
        if (visible.isEmpty()) return List.of();

        // coach names, resolved once per distinct id (SessionController#list's pattern)
        Map<UUID, String> coachNames = new HashMap<>();
        for (ClassSession s : visible) {
            if (s.getCoachId() != null && !coachNames.containsKey(s.getCoachId())) {
                coachNames.put(s.getCoachId(), coachName(s.getCoachId()));
            }
        }

        // class-type image, resolved once per distinct schedule slot (SessionDetailController#detail's pattern)
        Map<UUID, String> imageBySlot = new HashMap<>();
        for (ClassSession s : visible) {
            UUID slotId = s.getScheduleSlotId();
            if (slotId != null && !imageBySlot.containsKey(slotId)) {
                imageBySlot.put(slotId, classImage(slotId));
            }
        }

        // bookings for every visible session in one query, then grouped in Java
        List<UUID> sessionIds = visible.stream().map(ClassSession::getId).toList();
        Map<UUID, List<Booking>> bookingsBySession = bookings.findBySessionIdIn(sessionIds).stream()
                .collect(Collectors.groupingBy(Booking::getSessionId));

        return visible.stream().map(s -> {
            List<Booking> rows = bookingsBySession.getOrDefault(s.getId(), List.of());
            long booked = rows.stream()
                    .filter(b -> "BOOKED".equals(b.getStatus()) || "CHECKED_IN".equals(b.getStatus())).count();
            long waitlist = rows.stream().filter(b -> "WAITLIST".equals(b.getStatus())).count();
            // Same rule as SegmentResolver.roster: the same status set, distinct by membershipId —
            // not bookedCount + waitlistCount, which double-counts a membership holding two rows.
            long recipientCount = rows.stream()
                    .filter(b -> SegmentResolver.ROSTER_STATUSES.contains(b.getStatus()))
                    .map(Booking::getMembershipId)
                    .distinct()
                    .count();
            String image = s.getScheduleSlotId() == null ? null : imageBySlot.get(s.getScheduleSlotId());
            String coachName = s.getCoachId() == null ? null : coachNames.get(s.getCoachId());
            return new TargetSession(s.getId(), s.getName(), s.getStartAt(), image, coachName,
                    booked, waitlist, recipientCount);
        }).toList();
    }

    /** Coach display name for one coach user id, or null. Shared by targets() and classBrief(). */
    private String coachName(UUID coachId) {
        return coachId == null ? null : users.findById(coachId).map(User::getName).orElse(null);
    }

    /** The signed class-type image for one schedule slot, or null. Shared by targets() and classBrief(). */
    private String classImage(UUID scheduleSlotId) {
        if (scheduleSlotId == null) return null;
        return mediaSigner.sign(slots.findById(scheduleSlotId).flatMap(sl -> types.findById(sl.getClassTypeId()))
                .map(ClassType::getImagePath).orElse(null));
    }

    /**
     * The confirm dialog's recipient count. It MUST come from the same SegmentResolver the send
     * itself uses, not a second client-side reimplementation of the segment rule, or the number
     * shown could diverge from what actually gets written. Reuses assertMaySendToSegment first, so a
     * coach can never read the roster size of a class they do not coach — the preview would
     * otherwise leak what the send refuses.
     */
    @GetMapping("/preview")
    @Transactional(readOnly = true)
    public RecipientPreview preview(@RequestParam String segment, @RequestParam(required = false) UUID segmentRef) {
        RoleGuard.requireStaff();
        assertMaySendToSegment(segment, segmentRef);
        return new RecipientPreview(segments.resolve(segment, segmentRef).size());
    }

    /**
     * The detail sheet's data in one call: the announcement, its class (CLASS_ROSTER only, null if
     * the session has since been deleted), and every recipient with read state — read ones first,
     * each group alphabetical (product decision, 2026-08-31). Only the sender may see this — an
     * admin cannot browse a coach's outbox recipients and vice versa, mirroring history() being
     * mine-only. Membership carries no @TenantId discriminator, so the name lookup states its own
     * box predicate (SessionDetailController.detail's pattern), never findAll().
     */
    @GetMapping("/{id}/recipients")
    @Transactional(readOnly = true)
    public AnnouncementDetail recipients(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        Announcement a = assertIsSender(id);

        Map<UUID, Membership> memberById = memberships.findByBoxId(TenantContext.requireBoxId()).stream()
                .collect(Collectors.toMap(Membership::getId, m -> m, (x, y) -> x));

        List<RecipientRow> rows = this.recipients.findByAnnouncementId(a.getId()).stream()
                .map(r -> {
                    Membership m = memberById.get(r.getMembershipId());
                    String name = m == null ? "—" : m.getUser().getName();
                    String avatar = m == null ? null : mediaSigner.sign(m.getAvatarPath());
                    return new RecipientRow(r.getMembershipId(), name, avatar, r.getReadAt());
                })
                // read (readAt != null) sorts before unread; false < true, so "is unread" is the key
                .sorted(Comparator.comparing((RecipientRow row) -> row.readAt() == null)
                        .thenComparing(row -> row.name().toLowerCase()))
                .toList();

        return new AnnouncementDetail(a.getId(), a.getBody(), a.getSegment(), a.getSentAt(),
                recipients.countByAnnouncementId(a.getId()),
                recipients.countByAnnouncementIdAndReadAtIsNotNull(a.getId()),
                classBrief(a.getSegmentRef()), rows);
    }

    /**
     * CLASS_ROSTER's class, or null (EVERYONE/EXPIRING never carry a segmentRef, and a CLASS_ROSTER
     * session that has since been deleted resolves to nothing rather than throwing). segmentRef, when
     * set, always names a session in this same box (Announcement's own DB check), so the box-filtered
     * findById on the @TenantId ClassSession needs no extra predicate.
     */
    private ClassBrief classBrief(UUID segmentRef) {
        if (segmentRef == null) return null;
        return sessions.findById(segmentRef)
                .map(s -> new ClassBrief(s.getId(), s.getName(), s.getStartAt(),
                        classImage(s.getScheduleSlotId()), coachName(s.getCoachId())))
                .orElse(null);
    }

    /**
     * Box-scoped lookup, never a bare findById: a foreign-box id must not leak whether it exists.
     * A null sentBy (system/seed sends) is never equal to anybody — Objects.equals with a null
     * TenantContext.userId() would never happen (a real request always has a caller id), but the
     * announcement's OWN sentBy being null must never be treated as "matches", hence the explicit
     * null check rather than sentBy.equals(caller) alone reading backwards.
     */
    private Announcement assertIsSender(UUID announcementId) {
        Announcement a = announcements.findById(announcementId)
                .orElseThrow(() -> new AccessDeniedException("Announcement not found"));
        UUID sentBy = a.getSentBy();
        if (sentBy == null || !sentBy.equals(TenantContext.userId()))
            throw new AccessDeniedException("Only the sender may view recipients");
        return a;
    }

    private AnnouncementRow row(Announcement a) {
        return new AnnouncementRow(a.getId(), a.getBody(), a.getSegment(), a.getSentAt(),
                recipients.countByAnnouncementId(a.getId()),
                recipients.countByAnnouncementIdAndReadAtIsNotNull(a.getId()));
    }
}
