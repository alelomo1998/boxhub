package com.boxhub.performance;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.programming.SessionItem;
import com.boxhub.programming.SessionItemController;
import com.boxhub.programming.SessionItemRepository;
import com.boxhub.programming.WodRepository;
import jakarta.validation.Valid;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/sessions/items")
public class ScoreController {

    private final ScoreService service;
    private final SessionItemRepository items;
    private final WodRepository wods;
    private final ApplicationEventPublisher events;
    private final MembershipRepository memberships;

    public ScoreController(ScoreService service, SessionItemRepository items, WodRepository wods,
                           ApplicationEventPublisher events, MembershipRepository memberships) {
        this.service = service;
        this.items = items;
        this.wods = wods;
        this.events = events;
        this.memberships = memberships;
    }

    public record ScoreDto(UUID id, UUID itemId, boolean rx, Integer timeSeconds, Integer rounds, Integer reps,
                           BigDecimal load, boolean finished, String notes, boolean isPrivate, String scoreType) {}

    record ScoreRequest(boolean rx, Integer timeSeconds, Integer rounds, Integer reps, BigDecimal load,
                        Boolean finished, String notes, boolean isPrivate) {}

    String scoreTypeOf(UUID itemId) {
        SessionItem item = items.findById(itemId).orElseThrow(NoSuchElementException::new);
        return wods.findById(item.getWodId())
                .map(w -> SessionItemController.effectiveScoreType(item, w)).orElse("NONE");
    }

    private ScoreDto toDto(WodScore s) {
        return new ScoreDto(s.getId(), s.getSessionItemId(), s.isRx(), s.getTimeSeconds(), s.getRounds(), s.getReps(),
                s.getLoad(), s.isFinished(), s.getNotes(), s.isPrivate(), scoreTypeOf(s.getSessionItemId()));
    }

    @PutMapping("/{itemId}/score")
    public ScoreDto put(@PathVariable UUID itemId, @Valid @RequestBody ScoreRequest req) {
        WodScore s = service.upsert(itemId, new ScoreService.ScoreInput(
                req.rx(), req.timeSeconds(), req.rounds(), req.reps(), req.load(),
                req.finished(), req.notes(), req.isPrivate()));
        events.publishEvent(new com.boxhub.display.TvStateChanged(com.boxhub.shared.TenantContext.requireBoxId()));
        return toDto(s);
    }

    @PostMapping("/{itemId}/score/{membershipId}")
    public ScoreDto putFor(@PathVariable UUID itemId, @PathVariable UUID membershipId,
                           @Valid @RequestBody ScoreRequest req) {
        com.boxhub.shared.RoleGuard.requireStaff();
        UUID coachMid = memberships.findByUserIdAndBoxId(
                com.boxhub.shared.TenantContext.userId(), com.boxhub.shared.TenantContext.requireBoxId())
                .orElseThrow(java.util.NoSuchElementException::new).getId();
        WodScore s = service.upsertFor(itemId, membershipId, new ScoreService.ScoreInput(
                req.rx(), req.timeSeconds(), req.rounds(), req.reps(), req.load(),
                req.finished(), req.notes(), req.isPrivate()), coachMid);
        events.publishEvent(new com.boxhub.display.TvStateChanged(com.boxhub.shared.TenantContext.requireBoxId()));
        return toDto(s);
    }

    @GetMapping("/{itemId}/score")
    public ResponseEntity<ScoreDto> mine(@PathVariable UUID itemId) {
        return service.mine(itemId).map(s -> ResponseEntity.ok(toDto(s)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
