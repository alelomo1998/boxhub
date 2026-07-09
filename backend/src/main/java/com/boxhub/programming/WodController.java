package com.boxhub.programming;

import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/wods")
public class WodController {

    private final WodRepository wods;
    private final ProgramSlotRepository slots;
    private final WodService service;

    public WodController(WodRepository wods, ProgramSlotRepository slots, WodService service) {
        this.wods = wods;
        this.slots = slots;
        this.service = service;
    }

    public record WodDto(UUID id, String title, String wodType, String scoreType, Integer timeCapSeconds,
                         String bodyText, WodJson.Blocks blocks, String scalingNotes, UUID benchmarkTemplateId) {}

    WodDto toDto(Wod w) {
        return new WodDto(w.getId(), w.getTitle(), w.getWodType(), w.getScoreType(), w.getTimeCapSeconds(),
                w.getBodyText(), service.deserialize(w.getBlocksJson()), w.getScalingNotes(), w.getBenchmarkTemplateId());
    }

    record CreateWodRequest(@NotBlank String title, @NotBlank String wodType, @NotBlank String scoreType,
                            Integer timeCapSeconds, String bodyText, WodJson.Blocks blocks, String scalingNotes) {}
    record PatchWodRequest(String title, String wodType, String scoreType, Integer timeCapSeconds,
                           String bodyText, WodJson.Blocks blocks, String scalingNotes) {}

    @GetMapping
    public List<WodDto> list(@RequestParam(required = false) String search) {
        List<Wod> found = (search == null || search.isBlank())
                ? wods.findByOrderByUpdatedAtDesc()
                : wods.findByTitleContainingIgnoreCaseOrderByUpdatedAtDesc(search);
        return found.stream().map(this::toDto).toList();
    }

    @GetMapping("/{id}")
    public WodDto get(@PathVariable UUID id) {
        return toDto(wods.findById(id).orElseThrow(NoSuchElementException::new));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WodDto create(@Valid @RequestBody CreateWodRequest req) {
        RoleGuard.requireStaff();
        Wod w = new Wod();
        w.setTitle(req.title().trim());
        w.setWodType(req.wodType());
        w.setScoreType(req.scoreType());
        w.setTimeCapSeconds(req.timeCapSeconds());
        if (req.bodyText() != null) w.setBodyText(req.bodyText());
        w.setBlocksJson(service.serialize(req.blocks()));
        w.setScalingNotes(req.scalingNotes());
        w.setCreatedBy(TenantContext.userId());
        return toDto(wods.save(w));
    }

    @PatchMapping("/{id}")
    public WodDto patch(@PathVariable UUID id, @Valid @RequestBody PatchWodRequest req) {
        RoleGuard.requireStaff();
        Wod w = wods.findById(id).orElseThrow(NoSuchElementException::new);
        if (req.title() != null) w.setTitle(req.title().trim());
        if (req.wodType() != null) w.setWodType(req.wodType());
        if (req.scoreType() != null) w.setScoreType(req.scoreType());
        if (req.timeCapSeconds() != null) w.setTimeCapSeconds(req.timeCapSeconds());
        if (req.bodyText() != null) w.setBodyText(req.bodyText());
        if (req.blocks() != null) w.setBlocksJson(service.serialize(req.blocks()));
        if (req.scalingNotes() != null) w.setScalingNotes(req.scalingNotes());
        w.setUpdatedAt(Instant.now());
        return toDto(wods.save(w));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        Wod w = wods.findById(id).orElseThrow(NoSuchElementException::new);
        if (slots.existsByWodId(w.getId()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "WOD in use");
        wods.delete(w);
    }

    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public WodDto duplicate(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        Wod src = wods.findById(id).orElseThrow(NoSuchElementException::new);
        Wod copy = new Wod();
        copy.setTitle(src.getTitle() + " (copy)");
        copy.setWodType(src.getWodType());
        copy.setScoreType(src.getScoreType());
        copy.setTimeCapSeconds(src.getTimeCapSeconds());
        copy.setBodyText(src.getBodyText());
        copy.setBlocksJson(src.getBlocksJson());
        copy.setScalingNotes(src.getScalingNotes());
        copy.setBenchmarkTemplateId(src.getBenchmarkTemplateId());
        copy.setCreatedBy(TenantContext.userId());
        return toDto(wods.save(copy));
    }
}
