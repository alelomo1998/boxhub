package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.MediaSigner;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

/** Class detail visible to any ACTIVE box member: coach on top, booked athletes as an avatar grid. */
@RestController
@RequestMapping("/api/box/sessions")
public class SessionDetailController {

    private final ClassSessionRepository sessions;
    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final BookingRepository bookings;
    private final MembershipRepository memberships;
    private final UserRepository users;
    private final MediaSigner mediaSigner;

    public SessionDetailController(ClassSessionRepository sessions, ScheduleSlotRepository slots,
                                   ClassTypeRepository types, BookingRepository bookings,
                                   MembershipRepository memberships,
                                   UserRepository users, MediaSigner mediaSigner) {
        this.sessions = sessions;
        this.slots = slots;
        this.types = types;
        this.bookings = bookings;
        this.memberships = memberships;
        this.users = users;
        this.mediaSigner = mediaSigner;
    }

    public record CoachDto(String name, String avatarPath) {}
    public record GridEntry(UUID membershipId, String name, String avatarPath, String status) {}
    public record SessionDetailDto(UUID id, String name, Instant startAt, int durationMin, int capacity,
                                   String imagePath, String programmingStatus, CoachDto coach,
                                   List<GridEntry> active, List<GridEntry> queue) {}

    @GetMapping("/{id}/detail")
    @Transactional(readOnly = true)
    public SessionDetailDto detail(@PathVariable UUID id) {
        ClassSession s = sessions.findById(id).orElseThrow(NoSuchElementException::new);

        String image = mediaSigner.sign(s.getScheduleSlotId() == null ? null
                : slots.findById(s.getScheduleSlotId()).flatMap(sl -> types.findById(sl.getClassTypeId()))
                        .map(ClassType::getImagePath).orElse(null));

        CoachDto coach = null;
        if (s.getCoachId() != null) {
            User u = users.findById(s.getCoachId()).orElse(null);
            if (u != null) {
                String avatar = memberships.findByUserIdAndBoxId(u.getId(), s.getBoxId())
                        .map(Membership::getAvatarPath).orElse(null);
                coach = new CoachDto(u.getName(), mediaSigner.sign(avatar));
            }
        }

        Map<UUID, Membership> memberById = memberships.findAll().stream()
                .collect(Collectors.toMap(Membership::getId, m -> m, (a, b) -> a));

        List<Booking> all = bookings.findBySessionId(id);
        List<GridEntry> active = all.stream()
                .filter(b -> "BOOKED".equals(b.getStatus()) || "CHECKED_IN".equals(b.getStatus()))
                .sorted(Comparator.comparing(Booking::getBookedAt))
                .map(b -> entry(b, memberById)).toList();
        List<GridEntry> queue = all.stream()
                .filter(b -> "WAITLIST".equals(b.getStatus()))
                .sorted(Comparator.comparing(b -> b.getPosition() == null ? 0 : b.getPosition()))
                .map(b -> entry(b, memberById)).toList();

        return new SessionDetailDto(s.getId(), s.getName(), s.getStartAt(), s.getDurationMin(), s.getCapacity(),
                image, s.getProgrammingStatus(), coach, active, queue);
    }

    private GridEntry entry(Booking b, Map<UUID, Membership> memberById) {
        Membership m = memberById.get(b.getMembershipId());
        return new GridEntry(b.getMembershipId(),
                m == null ? "—" : m.getUser().getName(),
                m == null ? null : mediaSigner.sign(m.getAvatarPath()),
                b.getStatus());
    }
}
