package com.boxhub.performance;

import com.boxhub.programming.Movement;
import com.boxhub.programming.MovementRepository;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box/lifts")
public class LiftController {

    private final LiftEntryRepository lifts;
    private final MovementRepository movements;
    private final ScoreService scoreService; // reuse callerMembershipId()

    public LiftController(LiftEntryRepository lifts, MovementRepository movements, ScoreService scoreService) {
        this.lifts = lifts;
        this.movements = movements;
        this.scoreService = scoreService;
    }

    public record LiftDto(UUID id, UUID movementId, String movementName, BigDecimal load, int reps,
                          LocalDate performedOn, boolean isPr, String notes) {}

    record LiftRequest(@NotNull UUID movementId, @NotNull BigDecimal load, Integer reps,
                       LocalDate performedOn, String notes) {}

    private Map<UUID, String> movementNames() {
        return movements.findVisible(TenantContext.requireBoxId()).stream()
                .collect(Collectors.toMap(Movement::getId, Movement::getName, (a, b) -> a));
    }

    private LiftDto toDto(LiftEntry l, Map<UUID, String> names) {
        return new LiftDto(l.getId(), l.getMovementId(), names.getOrDefault(l.getMovementId(), "—"),
                l.getLoad(), l.getReps(), l.getPerformedOn(), l.isPr(), l.getNotes());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LiftDto log(@Valid @RequestBody LiftRequest req) {
        Map<UUID, String> names = movementNames();
        if (!names.containsKey(req.movementId())) throw new NoSuchElementException(); // not visible to this box
        UUID mid = scoreService.callerMembershipId();
        boolean pr = req.load().compareTo(lifts.maxLoad(mid, req.movementId())) > 0;
        LiftEntry l = new LiftEntry();
        l.setMembershipId(mid);
        l.setMovementId(req.movementId());
        l.setLoad(req.load());
        l.setReps(req.reps() == null ? 1 : req.reps());
        l.setPerformedOn(req.performedOn() == null ? LocalDate.now() : req.performedOn());
        l.setNotes(req.notes());
        l.setPr(pr);
        return toDto(lifts.save(l), names);
    }

    @GetMapping
    public List<LiftDto> byMovement(@RequestParam UUID movementId) {
        Map<UUID, String> names = movementNames();
        UUID mid = scoreService.callerMembershipId();
        return lifts.findByMembershipIdAndMovementIdOrderByPerformedOnAsc(mid, movementId).stream()
                .map(l -> toDto(l, names)).toList();
    }

    @GetMapping("/prs")
    public List<LiftDto> prs() {
        Map<UUID, String> names = movementNames();
        UUID mid = scoreService.callerMembershipId();
        // best (max load) entry per movement for this athlete
        Map<UUID, LiftEntry> best = lifts.findByMembershipIdOrderByPerformedOnDesc(mid).stream()
                .collect(Collectors.toMap(LiftEntry::getMovementId, l -> l,
                        (a, b) -> a.getLoad().compareTo(b.getLoad()) >= 0 ? a : b));
        return best.values().stream()
                .sorted(Comparator.comparing((LiftEntry l) -> names.getOrDefault(l.getMovementId(), "")))
                .map(l -> toDto(l, names)).toList();
    }
}
