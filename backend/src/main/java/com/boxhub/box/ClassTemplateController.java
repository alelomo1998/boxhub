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
import org.springframework.web.bind.annotation.*;

import java.time.LocalTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/class-templates")
public class ClassTemplateController {

    private final ScheduleSlotRepository slots;
    private final ClassTypeRepository types;
    private final SessionGenerator generator;
    private final MediaSigner mediaSigner;

    public ClassTemplateController(ScheduleSlotRepository slots, ClassTypeRepository types,
                                   SessionGenerator generator, MediaSigner mediaSigner) {
        this.slots = slots;
        this.types = types;
        this.generator = generator;
        this.mediaSigner = mediaSigner;
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
                                UUID coachId, Boolean active) {}

    private ClassType typeOf(ScheduleSlot s) {
        return types.findById(s.getClassTypeId()).orElseThrow(NoSuchElementException::new);
    }

    @GetMapping
    public List<TemplateDto> list() {
        return slots.findAll().stream().map(s -> TemplateDto.of(s, typeOf(s), mediaSigner)).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateDto create(@Valid @RequestBody CreateTemplateRequest req) {
        RoleGuard.requireStaff(); // M5: class types are coach/admin-managed
        ClassType t = new ClassType();
        t.setName(req.name().trim());
        ClassType savedType = types.save(t);

        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(savedType.getId());
        s.setWeekday(req.weekday());
        s.setStartTime(LocalTime.parse(req.startTime()));
        s.setDurationMin(req.durationMin());
        s.setCapacity(req.capacity());
        s.setCoachId(req.coachId());
        ScheduleSlot savedSlot = slots.save(s);
        generator.generateForBox(TenantContext.requireBoxId());
        return TemplateDto.of(savedSlot, savedType, mediaSigner);
    }

    @PatchMapping("/{id}")
    public TemplateDto patch(@PathVariable UUID id, @Valid @RequestBody PatchTemplateRequest req) {
        RoleGuard.requireStaff(); // M5: class types are coach/admin-managed
        ScheduleSlot s = slots.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign = 404
        ClassType t = typeOf(s);
        if (req.name() != null) t.setName(req.name().trim());
        if (req.imagePath() != null) t.setImagePath(requireOwnMedia(req.imagePath()));
        types.save(t);
        if (req.weekday() != null) s.setWeekday(req.weekday());
        if (req.startTime() != null) s.setStartTime(LocalTime.parse(req.startTime()));
        if (req.durationMin() != null) s.setDurationMin(req.durationMin());
        if (req.capacity() != null) s.setCapacity(req.capacity());
        if (req.coachId() != null) s.setCoachId(req.coachId());
        if (req.active() != null) s.setActive(req.active());
        ScheduleSlot savedSlot = slots.save(s);
        if (savedSlot.isActive()) generator.generateForBox(TenantContext.requireBoxId());
        return TemplateDto.of(savedSlot, t, mediaSigner);
    }
}
