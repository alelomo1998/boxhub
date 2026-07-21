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

    public record PlanDto(UUID id, String name, int durationDays, Integer weeklyClassLimit, boolean archived,
                          int priceCents, String currency, String entitlement) {
        static PlanDto of(Plan p) {
            return new PlanDto(p.getId(), p.getName(), p.getDurationDays(), p.getWeeklyClassLimit(), p.isArchived(),
                    p.getPriceCents(), p.getCurrency(), p.getEntitlement());
        }
    }

    // priceCents/currency/entitlement are optional for back-compat; entitlement defaults from whether
    // a weekly limit is set. WEEKLY_LIMIT without a weeklyClassLimit is rejected below.
    record CreatePlanRequest(@NotBlank String name, @Min(1) int durationDays, @Min(1) Integer weeklyClassLimit,
                             @Min(0) Integer priceCents, String currency, String entitlement) {}
    record PatchPlanRequest(String name, @Min(1) Integer durationDays, @Min(1) Integer weeklyClassLimit,
                            Boolean archived, @Min(0) Integer priceCents, String currency, String entitlement) {}

    private static String resolveEntitlement(String requested, Integer weeklyClassLimit) {
        String e = requested != null ? requested : (weeklyClassLimit != null ? "WEEKLY_LIMIT" : "UNLIMITED");
        if (!e.equals("UNLIMITED") && !e.equals("WEEKLY_LIMIT"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "entitlement must be UNLIMITED or WEEKLY_LIMIT");
        if (e.equals("WEEKLY_LIMIT") && weeklyClassLimit == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WEEKLY_LIMIT requires weeklyClassLimit");
        return e;
    }

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
        p.setPriceCents(req.priceCents() != null ? req.priceCents() : 0);
        p.setCurrency(req.currency() != null ? req.currency() : "eur");
        p.setEntitlement(resolveEntitlement(req.entitlement(), req.weeklyClassLimit()));
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
        if (req.priceCents() != null) p.setPriceCents(req.priceCents());
        if (req.currency() != null) p.setCurrency(req.currency());
        // Re-resolve entitlement against the final weekly-limit state so the two never drift apart.
        if (req.entitlement() != null || req.weeklyClassLimit() != null)
            p.setEntitlement(resolveEntitlement(
                    req.entitlement() != null ? req.entitlement() : p.getEntitlement(), p.getWeeklyClassLimit()));
        try {
            return PlanDto.of(plans.saveAndFlush(p));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan name already exists");
        }
    }
}
