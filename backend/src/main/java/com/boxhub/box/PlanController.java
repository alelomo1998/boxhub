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

    /**
     * `entitlement` and `weeklyClassLimit` are DERIVED, not stored — V28 dropped both columns.
     * They stay on the wire because frontend/src/app/features/admin/plans.page.ts binds them
     * (a select, a disabled-when-UNLIMITED input, and "N/week" in the list), exactly as M14a kept
     * `wodType` alive as `timingPreset ?? macro` after its column was gone. The shim is deleted by
     * whichever milestone rebuilds the plan admin screen (M14b or M17) — recorded in docs/HANDOFF.md.
     */
    public record PlanDto(UUID id, String name, int durationDays, Integer weeklyClassLimit, boolean archived,
                          int priceCents, String currency, String entitlement,
                          Integer entriesPerDay, Integer entriesPerWeek, Integer entriesPerMonth, Integer entriesTotal,
                          Integer cancellationsPerDay, Integer cancellationsPerWeek,
                          Integer cancellationsPerMonth, Integer cancellationsTotal) {
        static PlanDto of(Plan p) {
            return new PlanDto(p.getId(), p.getName(), p.getDurationDays(), p.getEntriesPerWeek(), p.isArchived(),
                    p.getPriceCents(), p.getCurrency(), p.isUnlimited() ? "UNLIMITED" : "WEEKLY_LIMIT",
                    p.getEntriesPerDay(), p.getEntriesPerWeek(), p.getEntriesPerMonth(), p.getEntriesTotal(),
                    p.getCancellationsPerDay(), p.getCancellationsPerWeek(),
                    p.getCancellationsPerMonth(), p.getCancellationsTotal());
        }
    }

    // weeklyClassLimit is accepted as an alias for entriesPerWeek. `entitlement` no longer decides
    // anything — the nullability of the eight limits says it directly — but it is still VALIDATED
    // against the weekly alias (see requireWeeklyLimit below), because the screen that sends it can
    // still send WEEKLY_LIMIT with an empty limit input and must be told 400 rather than silently
    // getting an unlimited plan.
    record CreatePlanRequest(@NotBlank String name, @Min(1) int durationDays, @Min(1) Integer weeklyClassLimit,
                             @Min(0) Integer priceCents, String currency, String entitlement,
                             @Min(1) Integer entriesPerDay, @Min(1) Integer entriesPerWeek,
                             @Min(1) Integer entriesPerMonth, @Min(1) Integer entriesTotal,
                             @Min(1) Integer cancellationsPerDay, @Min(1) Integer cancellationsPerWeek,
                             @Min(1) Integer cancellationsPerMonth, @Min(1) Integer cancellationsTotal) {}

    record PatchPlanRequest(String name, @Min(1) Integer durationDays, @Min(1) Integer weeklyClassLimit,
                            Boolean archived, @Min(0) Integer priceCents, String currency, String entitlement,
                            @Min(1) Integer entriesPerDay, @Min(1) Integer entriesPerWeek,
                            @Min(1) Integer entriesPerMonth, @Min(1) Integer entriesTotal,
                            @Min(1) Integer cancellationsPerDay, @Min(1) Integer cancellationsPerWeek,
                            @Min(1) Integer cancellationsPerMonth, @Min(1) Integer cancellationsTotal) {}

    /**
     * The one piece of `resolveEntitlement` that survives V28. The rest of it existed only to keep
     * two redundant columns consistent with each other and died with the redundancy — but this half
     * guards a live screen: plans.page.ts sends `entitlement: 'WEEKLY_LIMIT'` with
     * `weeklyClassLimit: undefined` when an admin picks the limited option and leaves the number
     * blank. Dropping the check turns that mistake into a silently-unlimited plan named as if it
     * were limited. Deleted along with the rest of the shim when M14b/M17 rebuilds the screen.
     */
    private static void requireWeeklyLimit(String entitlement, Integer resolvedEntriesPerWeek) {
        if ("WEEKLY_LIMIT".equals(entitlement) && resolvedEntriesPerWeek == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WEEKLY_LIMIT requires weeklyClassLimit");
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
        p.setPriceCents(req.priceCents() != null ? req.priceCents() : 0);
        p.setCurrency(req.currency() != null ? req.currency() : "eur");
        // "UNLIMITED" explicitly clears the weekly alias: plans.page.ts still posts a stale
        // weeklyClassLimit alongside entitlement='UNLIMITED' when the admin flips the select back.
        boolean explicitlyUnlimited = "UNLIMITED".equals(req.entitlement());
        p.setEntriesPerWeek(explicitlyUnlimited ? req.entriesPerWeek()
                : (req.entriesPerWeek() != null ? req.entriesPerWeek() : req.weeklyClassLimit()));
        p.setEntriesPerDay(req.entriesPerDay());
        p.setEntriesPerMonth(req.entriesPerMonth());
        p.setEntriesTotal(req.entriesTotal());
        p.setCancellationsPerDay(req.cancellationsPerDay());
        p.setCancellationsPerWeek(req.cancellationsPerWeek());
        p.setCancellationsPerMonth(req.cancellationsPerMonth());
        p.setCancellationsTotal(req.cancellationsTotal());
        requireWeeklyLimit(req.entitlement(), p.getEntriesPerWeek());
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
        if (req.archived() != null) p.setArchived(req.archived());
        if (req.priceCents() != null) p.setPriceCents(req.priceCents());
        if (req.currency() != null) p.setCurrency(req.currency());
        // Same alias rule as create(): an explicit UNLIMITED clears every entry limit, which is what
        // the old `entitlement` select meant when an admin switched a limited plan back to unlimited.
        if ("UNLIMITED".equals(req.entitlement())) {
            p.setEntriesPerDay(null); p.setEntriesPerWeek(null);
            p.setEntriesPerMonth(null); p.setEntriesTotal(null);
        } else if (req.weeklyClassLimit() != null) {
            p.setEntriesPerWeek(req.weeklyClassLimit());
        }
        if (req.entriesPerDay() != null) p.setEntriesPerDay(req.entriesPerDay());
        if (req.entriesPerWeek() != null) p.setEntriesPerWeek(req.entriesPerWeek());
        if (req.entriesPerMonth() != null) p.setEntriesPerMonth(req.entriesPerMonth());
        if (req.entriesTotal() != null) p.setEntriesTotal(req.entriesTotal());
        if (req.cancellationsPerDay() != null) p.setCancellationsPerDay(req.cancellationsPerDay());
        if (req.cancellationsPerWeek() != null) p.setCancellationsPerWeek(req.cancellationsPerWeek());
        if (req.cancellationsPerMonth() != null) p.setCancellationsPerMonth(req.cancellationsPerMonth());
        if (req.cancellationsTotal() != null) p.setCancellationsTotal(req.cancellationsTotal());
        requireWeeklyLimit(req.entitlement(), p.getEntriesPerWeek());
        try {
            return PlanDto.of(plans.saveAndFlush(p));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Plan name already exists");
        }
    }
}
