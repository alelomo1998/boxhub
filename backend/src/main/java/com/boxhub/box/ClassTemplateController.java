package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.LocalTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/class-templates")
public class ClassTemplateController {

    private final ClassTemplateRepository templates;

    public ClassTemplateController(ClassTemplateRepository templates) {
        this.templates = templates;
    }

    public record TemplateDto(UUID id, String name, int weekday, LocalTime startTime,
                              int durationMin, int capacity, UUID coachId, boolean active) {
        static TemplateDto of(ClassTemplate t) {
            return new TemplateDto(t.getId(), t.getName(), t.getWeekday(), t.getStartTime(),
                    t.getDurationMin(), t.getCapacity(), t.getCoachId(), t.isActive());
        }
    }

    record CreateTemplateRequest(@NotBlank String name, @Min(0) @Max(6) int weekday,
                                 @NotBlank String startTime, @Min(1) int durationMin,
                                 @Min(1) int capacity, UUID coachId) {}

    record PatchTemplateRequest(String name, @Min(0) @Max(6) Integer weekday, String startTime,
                                @Min(1) Integer durationMin, @Min(1) Integer capacity,
                                UUID coachId, Boolean active) {}

    @GetMapping
    public List<TemplateDto> list() {
        return templates.findAll().stream().map(TemplateDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateDto create(@Valid @RequestBody CreateTemplateRequest req) {
        RoleGuard.requireBoxAdmin();
        ClassTemplate t = new ClassTemplate();
        t.setName(req.name().trim());
        t.setWeekday(req.weekday());
        t.setStartTime(LocalTime.parse(req.startTime()));
        t.setDurationMin(req.durationMin());
        t.setCapacity(req.capacity());
        t.setCoachId(req.coachId());
        return TemplateDto.of(templates.save(t));
    }

    @PatchMapping("/{id}")
    public TemplateDto patch(@PathVariable UUID id, @Valid @RequestBody PatchTemplateRequest req) {
        RoleGuard.requireBoxAdmin();
        ClassTemplate t = templates.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign = 404
        if (req.name() != null) t.setName(req.name().trim());
        if (req.weekday() != null) t.setWeekday(req.weekday());
        if (req.startTime() != null) t.setStartTime(LocalTime.parse(req.startTime()));
        if (req.durationMin() != null) t.setDurationMin(req.durationMin());
        if (req.capacity() != null) t.setCapacity(req.capacity());
        if (req.coachId() != null) t.setCoachId(req.coachId());
        if (req.active() != null) t.setActive(req.active());
        return TemplateDto.of(templates.save(t));
    }
}
