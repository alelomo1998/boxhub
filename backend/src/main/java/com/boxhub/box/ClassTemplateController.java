package com.boxhub.box;

import com.boxhub.shared.MediaSigner;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box/class-templates")
public class ClassTemplateController {

    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final SessionGenerator generator;
    private final MediaSigner mediaSigner;
    private final SlotRegenerationService regeneration;
    private final ClassSessionRepository sessions;
    private final BoxRepository boxes;

    public ClassTemplateController(ScheduleSlotRepository slots, ClassTypeRepository types,
                                   SessionGenerator generator, MediaSigner mediaSigner,
                                   SlotRegenerationService regeneration, ClassSessionRepository sessions,
                                   BoxRepository boxes) {
        this.slots = slots;
        this.types = types;
        this.generator = generator;
        this.mediaSigner = mediaSigner;
        this.regeneration = regeneration;
        this.sessions = sessions;
        this.boxes = boxes;
    }

    /**
     * M11: since T4 this path is minted into a signed nginx `secure_link` URL, so whatever is
     * stored here becomes a working capability to read that file. Without this check a hostile
     * box admin could store another box's media path and have us sign it for them. Same guard as
     * ProfileController#setAvatar — every field that feeds MediaSigner.sign() needs one.
     */
    private static String requireOwnMedia(String path) {
        if (!path.startsWith("/media/" + TenantContext.requireBoxId() + "/"))
            throw new AccessDeniedException("Image must be an uploaded media path of this box");
        return path;
    }

    public record TemplateDto(UUID id, String name, int weekday, LocalTime startTime,
                              int durationMin, int capacity, UUID coachId, boolean active, String imagePath) {
        static TemplateDto of(ScheduleSlot s, ClassType t, MediaSigner mediaSigner) {
            return new TemplateDto(s.getId(), t.getName(), s.getWeekday(), s.getStartTime(),
                    s.getDurationMin(), s.getCapacity(), s.getCoachId(), s.isActive(), mediaSigner.sign(t.getImagePath()));
        }
    }

    record CreateTemplateRequest(@NotBlank String name, @Min(0) @Max(6) int weekday,
                                 @NotBlank String startTime, @Min(1) int durationMin,
                                 @Min(1) int capacity, UUID coachId) {}

    record PatchTemplateRequest(String name, @Min(0) @Max(6) Integer weekday, String startTime, String imagePath,
                                @Min(1) Integer durationMin, @Min(1) Integer capacity,
                                UUID coachId, Boolean active, LocalDate applyFrom) {}

    private ClassType typeOf(ScheduleSlot s) {
        return types.findById(s.getClassTypeId()).orElseThrow(NoSuchElementException::new);
    }

    /**
     * Addendum F's "(or find)": class_type carries unique (box_id, name), and a class that runs on
     * several weekdays is exactly one type with several slots (the whole point of the split), so a
     * second POST/PATCH naming an existing type must reuse it rather than collide on the constraint.
     * findByName is a derived query on a @TenantId entity, so it is already scoped to the caller's box.
     */
    private ClassType findOrCreateType(String name) {
        return types.findByName(name).orElseGet(() -> {
            ClassType t = new ClassType();
            t.setName(name);
            return types.save(t);
        });
    }

    @GetMapping
    public List<TemplateDto> list() {
        Map<UUID, ClassType> typesById = types.findAll().stream()
                .collect(Collectors.toMap(ClassType::getId, t -> t));
        return slots.findAll().stream()
                .map(s -> TemplateDto.of(s, typesById.get(s.getClassTypeId()), mediaSigner))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateDto create(@Valid @RequestBody CreateTemplateRequest req) {
        RoleGuard.requireStaff(); // M5: class types are coach/admin-managed
        ClassType type = findOrCreateType(req.name().trim());

        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(type.getId());
        s.setWeekday(req.weekday());
        s.setStartTime(LocalTime.parse(req.startTime()));
        s.setDurationMin(req.durationMin());
        s.setCapacity(req.capacity());
        s.setCoachId(req.coachId());
        ScheduleSlot savedSlot = slots.save(s);
        generator.generateForBox(TenantContext.requireBoxId());
        return TemplateDto.of(savedSlot, type, mediaSigner);
    }

    /**
     * @Transactional is load-bearing here for TWO reasons, and the second is the subtle one.
     *
     * <p>1. renameFutureSessions is a @Modifying bulk query with flushAutomatically=true, which
     * needs an open transaction to flush against — this method had none before (same reasoning as
     * SessionController#patch, M29b D-4).
     *
     * <p>2. It is what makes a REFUSED edit atomic. regenerateFrom throws on a range holding a live
     * booking, and without a transaction spanning this method the slots.save(s) below would already
     * have committed by then — leaving the slot moved to 07:00 while its sessions all stayed at
     * 06:00, which is a worse state than either outcome. The rollback is the guarantee behind
     * "a refused edit must not have written the slot either".
     */
    @Transactional
    @PatchMapping("/{id}")
    public TemplateDto patch(@PathVariable UUID id, @Valid @RequestBody PatchTemplateRequest req) {
        RoleGuard.requireStaff(); // M5: class types are coach/admin-managed
        ScheduleSlot s = slots.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign = 404
        ClassType t = typeOf(s);

        // Computed BEFORE the setters below, or every comparison reads the value we just wrote.
        boolean scheduleChanged =
                (req.weekday() != null && req.weekday() != s.getWeekday())
             || (req.startTime() != null && !LocalTime.parse(req.startTime()).equals(s.getStartTime()))
             || (req.durationMin() != null && req.durationMin() != s.getDurationMin())
             || (req.capacity() != null && req.capacity() != s.getCapacity())
             || (req.coachId() != null && !req.coachId().equals(s.getCoachId()));
        boolean renamed = req.name() != null && !req.name().trim().equals(t.getName());

        if (req.name() != null) {
            String newName = req.name().trim();
            if (!newName.equals(t.getName())) {
                // Renaming to a name no type holds renames the shared type in place — every sibling
                // slot's name changes too, correctly (one class, several slots). Renaming to a name
                // ANOTHER type already holds cannot also rename (unique (box_id, name)) — that isn't
                // an error, it's this slot moving to the type that already exists under that name.
                Optional<ClassType> existing = types.findByName(newName);
                if (existing.isPresent()) {
                    t = existing.get();
                    s.setClassTypeId(t.getId());
                } else {
                    t.setName(newName);
                }
            }
        }
        if (req.imagePath() != null) t.setImagePath(requireOwnMedia(req.imagePath()));
        types.save(t);
        if (req.weekday() != null) s.setWeekday(req.weekday());
        if (req.startTime() != null) s.setStartTime(LocalTime.parse(req.startTime()));
        if (req.durationMin() != null) s.setDurationMin(req.durationMin());
        if (req.capacity() != null) s.setCapacity(req.capacity());
        if (req.coachId() != null) s.setCoachId(req.coachId());
        if (req.active() != null) s.setActive(req.active());
        ScheduleSlot savedSlot = slots.save(s);
        if (savedSlot.isActive()) {
            if (scheduleChanged) {
                // Regeneration REFUSES a range holding a live booking rather than cancelling it
                // (M14a decision 11) — both destructive options send mail, and an admin adjusting a
                // schedule must not be able to mail forty people by accident. The 409 carries the
                // blocking dates so the screen can offer a later applyFrom.
                ZoneId tz = ZoneId.of(boxes.findById(savedSlot.getBoxId()).orElseThrow().getTimezone());
                regeneration.regenerateFrom(savedSlot.getId(),
                        req.applyFrom() != null ? req.applyFrom() : LocalDate.now(tz));
            } else {
                generator.generateForBox(TenantContext.requireBoxId());
            }
        }

        // A rename is NOT a regeneration: a name is not a booking-relevant number, so updating it in
        // place invalidates nothing, whereas regenerating for a typo fix would be refused on any booked
        // slot. Runs after the block above so a combined rename+reschedule renames the NEW sessions.
        if (renamed) {
            List<UUID> slotIds = slots.findByClassTypeId(t.getId()).stream().map(ScheduleSlot::getId).toList();
            sessions.renameFutureSessions(slotIds, t.getName(), Instant.now());
        }

        return TemplateDto.of(savedSlot, t, mediaSigner);
    }
}
