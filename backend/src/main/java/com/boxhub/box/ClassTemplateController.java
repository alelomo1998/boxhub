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

    private final ClassTemplateRepository templates;
    private final SessionGenerator generator;
    private final MediaSigner mediaSigner;

    public ClassTemplateController(ClassTemplateRepository templates, SessionGenerator generator, MediaSigner mediaSigner) {
        this.templates = templates;
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
        static TemplateDto of(ClassTemplate t, MediaSigner mediaSigner) {
            return new TemplateDto(t.getId(), t.getName(), t.getWeekday(), t.getStartTime(),
                    t.getDurationMin(), t.getCapacity(), t.getCoachId(), t.isActive(), mediaSigner.sign(t.getImagePath()));
        }
    }

    record CreateTemplateRequest(@NotBlank String name, @Min(0) @Max(6) int weekday,
                                 @NotBlank String startTime, @Min(1) int durationMin,
                                 @Min(1) int capacity, UUID coachId) {}

    record PatchTemplateRequest(String name, @Min(0) @Max(6) Integer weekday, String startTime, String imagePath,
                                @Min(1) Integer durationMin, @Min(1) Integer capacity,
                                UUID coachId, Boolean active) {}

    @GetMapping
    public List<TemplateDto> list() {
        return templates.findAll().stream().map(t -> TemplateDto.of(t, mediaSigner)).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateDto create(@Valid @RequestBody CreateTemplateRequest req) {
        RoleGuard.requireStaff(); // M5: class types are coach/admin-managed
        ClassTemplate t = new ClassTemplate();
        t.setName(req.name().trim());
        t.setWeekday(req.weekday());
        t.setStartTime(LocalTime.parse(req.startTime()));
        t.setDurationMin(req.durationMin());
        t.setCapacity(req.capacity());
        t.setCoachId(req.coachId());
        ClassTemplate saved = templates.save(t);
        generator.generateForBox(TenantContext.requireBoxId());
        return TemplateDto.of(saved, mediaSigner);
    }

    @PatchMapping("/{id}")
    public TemplateDto patch(@PathVariable UUID id, @Valid @RequestBody PatchTemplateRequest req) {
        RoleGuard.requireStaff(); // M5: class types are coach/admin-managed
        ClassTemplate t = templates.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign = 404
        if (req.name() != null) t.setName(req.name().trim());
        if (req.weekday() != null) t.setWeekday(req.weekday());
        if (req.startTime() != null) t.setStartTime(LocalTime.parse(req.startTime()));
        if (req.durationMin() != null) t.setDurationMin(req.durationMin());
        if (req.capacity() != null) t.setCapacity(req.capacity());
        if (req.coachId() != null) t.setCoachId(req.coachId());
        if (req.imagePath() != null) t.setImagePath(requireOwnMedia(req.imagePath()));
        if (req.active() != null) t.setActive(req.active());
        ClassTemplate saved = templates.save(t);
        if (saved.isActive()) generator.generateForBox(TenantContext.requireBoxId());
        return TemplateDto.of(saved, mediaSigner);
    }
}
