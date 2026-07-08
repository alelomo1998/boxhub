package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/plans")
public class PlanController {

    private final PlanRepository plans;

    public PlanController(PlanRepository plans) {
        this.plans = plans;
    }

    public record PlanDto(UUID id, String name, int durationDays, Integer weeklyClassLimit, boolean archived) {
        static PlanDto of(Plan p) {
            return new PlanDto(p.getId(), p.getName(), p.getDurationDays(), p.getWeeklyClassLimit(), p.isArchived());
        }
    }

    record CreatePlanRequest(@NotBlank String name, @Min(1) int durationDays, @Min(1) Integer weeklyClassLimit) {}
    record PatchPlanRequest(String name, @Min(1) Integer durationDays, @Min(1) Integer weeklyClassLimit, Boolean archived) {}

    @GetMapping
    public List<PlanDto> list() {
        return plans.findByArchivedFalse().stream().map(PlanDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlanDto create(@Valid @RequestBody CreatePlanRequest req) {
        RoleGuard.requireBoxAdmin();
        Plan p = new Plan();
        p.setName(req.name().trim());
        p.setDurationDays(req.durationDays());
        p.setWeeklyClassLimit(req.weeklyClassLimit());
        try {
            return PlanDto.of(plans.saveAndFlush(p));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan name already exists");
        }
    }

    @PatchMapping("/{id}")
    public PlanDto patch(@PathVariable UUID id, @Valid @RequestBody PatchPlanRequest req) {
        RoleGuard.requireBoxAdmin();
        Plan p = plans.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign ids look absent
        if (req.name() != null) p.setName(req.name().trim());
        if (req.durationDays() != null) p.setDurationDays(req.durationDays());
        if (req.weeklyClassLimit() != null) p.setWeeklyClassLimit(req.weeklyClassLimit());
        if (req.archived() != null) p.setArchived(req.archived());
        try {
            return PlanDto.of(plans.saveAndFlush(p));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan name already exists");
        }
    }
}
