package com.boxhub.performance;

import com.boxhub.programming.ProgramSlotRepository;
import com.boxhub.programming.WodRepository;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/program")
public class ScoreController {

    private final ScoreService service;
    private final ProgramSlotRepository slots;
    private final WodRepository wods;

    public ScoreController(ScoreService service, ProgramSlotRepository slots, WodRepository wods) {
        this.service = service;
        this.slots = slots;
        this.wods = wods;
    }

    public record ScoreDto(UUID id, UUID slotId, boolean rx, Integer timeSeconds, Integer rounds, Integer reps,
                           BigDecimal load, boolean finished, String notes, boolean isPrivate, String scoreType) {}

    record ScoreRequest(boolean rx, Integer timeSeconds, Integer rounds, Integer reps, BigDecimal load,
                        Boolean finished, String notes, boolean isPrivate) {}

    private String scoreTypeOfSlot(UUID slotId) {
        var slot = slots.findById(slotId).orElseThrow(NoSuchElementException::new);
        return wods.findById(slot.getWodId()).map(w -> w.getScoreType()).orElse("NONE");
    }

    private ScoreDto toDto(WodScore s) {
        return new ScoreDto(s.getId(), s.getSlotId(), s.isRx(), s.getTimeSeconds(), s.getRounds(), s.getReps(),
                s.getLoad(), s.isFinished(), s.getNotes(), s.isPrivate(), scoreTypeOfSlot(s.getSlotId()));
    }

    @PutMapping("/{slotId}/score")
    public ScoreDto put(@PathVariable UUID slotId, @Valid @RequestBody ScoreRequest req) {
        WodScore s = service.upsert(slotId, new ScoreService.ScoreInput(
                req.rx(), req.timeSeconds(), req.rounds(), req.reps(), req.load(),
                req.finished(), req.notes(), req.isPrivate()));
        return toDto(s);
    }

    @GetMapping("/{slotId}/score")
    public ResponseEntity<ScoreDto> mine(@PathVariable UUID slotId) {
        return service.mine(slotId).map(s -> ResponseEntity.ok(toDto(s)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
