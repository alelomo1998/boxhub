package com.boxhub.performance;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.programming.SessionItem;
import com.boxhub.programming.SessionItemRepository;
import com.boxhub.programming.Wod;
import com.boxhub.programming.WodRepository;
import jakarta.validation.Valid;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/sessions/items")
public class ScoreController {

    private final ScoreService service;
    private final SessionItemRepository items;
    private final ApplicationEventPublisher events;
    private final MembershipRepository memberships;
    private final WodRepository wods;

    public ScoreController(ScoreService service, SessionItemRepository items,
                           ApplicationEventPublisher events, MembershipRepository memberships,
                           WodRepository wods) {
        this.service = service;
        this.items = items;
        this.events = events;
        this.memberships = memberships;
        this.wods = wods;
    }

    public record ScoreDto(UUID id, UUID itemId, boolean rx, Integer timeSeconds, Integer rounds, Integer reps,
                           BigDecimal load, boolean finished, String notes, boolean isPrivate, String scoreType) {}

    record ScoreRequest(boolean rx, Integer timeSeconds, Integer rounds, Integer reps, BigDecimal load,
                        Boolean finished, String notes, boolean isPrivate) {}

    String scoreTypeOf(UUID itemId) {
        // explicit now (M14a) — session_item.score_type is NOT NULL, no wod-derived fallback left
        return items.findById(itemId).orElseThrow(NoSuchElementException::new).getScoreType();
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

    // membershipIds is deliberately NOT @NotEmpty: the count is checked against the piece's own
    // team_size below, which is the only meaningful answer, and a bean-level rejection would 400
    // before the tenancy check on {itemId} ever runs.
    record TeamScoreRequest(List<UUID> membershipIds, String teamName,
                            boolean rx, Integer timeSeconds, Integer rounds, Integer reps,
                            BigDecimal load, Boolean finished, String notes, boolean isPrivate) {}

    /**
     * One team result, written as N rows sharing a team_id (spec 5.2). The caller must be one of the
     * named members, or staff -- an athlete may not log a result for a team they are not in.
     */
    @PostMapping("/{itemId}/score/team")
    public List<ScoreDto> putTeam(@PathVariable UUID itemId, @Valid @RequestBody TeamScoreRequest req) {
        // Tenant-filtered, so a foreign item is a 404 here, before anything else is considered.
        SessionItem item = items.findById(itemId).orElseThrow(NoSuchElementException::new);
        Wod wod = wods.findById(item.getWodId()).orElseThrow(NoSuchElementException::new);

        List<UUID> ids = req.membershipIds() == null ? List.of() : req.membershipIds();
        if (ids.size() != wod.getTeamSize())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This piece is a team of " + wod.getTeamSize());
        if (new java.util.HashSet<>(ids).size() != ids.size())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A member is listed twice");

        String role = com.boxhub.shared.TenantContext.role();
        boolean staff = "COACH".equals(role) || "BOX_ADMIN".equals(role);
        UUID mine = service.callerMembershipId();
        if (!staff && !ids.contains(mine))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a member of this team");

        // Each membership is validated to be in the caller's box inside upsertFor, in the same
        // transaction: a foreign id 404s and rolls the whole team back rather than half-writing it.
        List<WodScore> saved = service.upsertTeam(itemId, ids, req.teamName(),
                new ScoreService.ScoreInput(req.rx(), req.timeSeconds(), req.rounds(), req.reps(),
                        req.load(), req.finished(), req.notes(), req.isPrivate()),
                mine);
        events.publishEvent(new com.boxhub.display.TvStateChanged(com.boxhub.shared.TenantContext.requireBoxId()));
        return saved.stream().map(this::toDto).toList();
    }

    @GetMapping("/{itemId}/score")
    public ResponseEntity<ScoreDto> mine(@PathVariable UUID itemId) {
        return service.mine(itemId).map(s -> ResponseEntity.ok(toDto(s)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
