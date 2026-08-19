package com.boxhub.programming;

import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.performance.WodScoreRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

/** Programming of a class instance: ordered pieces, replace-items writes, per-instance publish. */
@RestController
@RequestMapping("/api/box/sessions")
public class SessionItemController {

    private final SessionItemRepository items;
    private final ClassSessionRepository sessions;
    private final WodRepository wods;
    private final WodService wodService;
    private final WodScoreRepository scores;
    private final MembershipRepository memberships;

    public SessionItemController(SessionItemRepository items, ClassSessionRepository sessions, WodRepository wods,
                                 WodService wodService, WodScoreRepository scores, MembershipRepository memberships) {
        this.items = items;
        this.sessions = sessions;
        this.wods = wods;
        this.wodService = wodService;
        this.scores = scores;
        this.memberships = memberships;
    }

    private static final java.util.Set<String> SCORE_TYPES = java.util.Set.of("TIME", "ROUNDS_REPS", "LOAD", "NONE");

    public record ItemDto(UUID id, UUID wodId, WodController.WodDto wod, int sortOrder,
                          boolean scoreable, String scoreType, boolean myScoreLogged) {}
    record ItemInput(@NotNull UUID wodId, boolean scoreable, String scoreType) {}
    record ItemsRequest(@NotNull List<ItemInput> items) {}
    record ProgrammingRequest(@NotNull String status) {}

    private boolean isStaff() {
        String role = TenantContext.role();
        return "COACH".equals(role) || "BOX_ADMIN".equals(role);
    }

    private UUID callerMembershipId() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .map(m -> m.getId()).orElse(null);
    }

    List<ItemDto> toDtos(List<SessionItem> list) {
        Map<UUID, Wod> wodById = wods.findAll().stream().collect(Collectors.toMap(Wod::getId, w -> w, (a, b) -> a));
        UUID mid = callerMembershipId();
        return list.stream().map(i -> {
            Wod w = wodById.get(i.getWodId());
            boolean logged = mid != null && scores.findBySessionItemIdAndMembershipId(i.getId(), mid).isPresent();
            return new ItemDto(i.getId(), i.getWodId(), w == null ? null : wodService.toDto(w),
                    i.getSortOrder(), i.isScoreable(), i.getScoreType(), logged);
        }).toList();
    }

    @GetMapping("/{sessionId}/items")
    @Transactional(readOnly = true)
    public List<ItemDto> list(@PathVariable UUID sessionId) {
        ClassSession s = sessions.findById(sessionId).orElseThrow(NoSuchElementException::new);
        if (!isStaff() && !"PUBLISHED".equals(s.getProgrammingStatus())) return List.of(); // drafts invisible to members
        return toDtos(items.findBySessionIdOrderBySortOrderAsc(sessionId));
    }

    @PutMapping("/{sessionId}/items")
    @Transactional
    public List<ItemDto> replace(@PathVariable UUID sessionId, @Valid @RequestBody ItemsRequest req) {
        RoleGuard.requireStaff();
        sessions.findById(sessionId).orElseThrow(NoSuchElementException::new);
        Map<UUID, Wod> wodByInputId = new java.util.HashMap<>();
        for (ItemInput in : req.items()) {
            // tenant-filtered -> foreign 404; kept for the write-time score-type derivation below
            Wod w = wods.findById(in.wodId()).orElseThrow(NoSuchElementException::new);
            wodByInputId.put(in.wodId(), w);
            if (in.scoreType() != null && !SCORE_TYPES.contains(in.scoreType()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown score type");
        }
        items.deleteBySessionId(sessionId);
        items.flush();
        int sort = 0;
        for (ItemInput in : req.items()) {
            SessionItem i = new SessionItem();
            i.setSessionId(sessionId);
            i.setWodId(in.wodId());
            i.setSortOrder(sort++);
            i.setScoreable(in.scoreable());
            // score_type is NOT NULL (M14a): null on the wire still means "auto", but the derivation
            // now happens here, at write time, rather than on every read.
            i.setScoreType(in.scoreType() != null ? in.scoreType() : wodByInputId.get(in.wodId()).getScoreType());
            items.save(i);
        }
        return toDtos(items.findBySessionIdOrderBySortOrderAsc(sessionId));
    }

    @PatchMapping("/{sessionId}/programming")
    public Map<String, String> publish(@PathVariable UUID sessionId, @Valid @RequestBody ProgrammingRequest req) {
        RoleGuard.requireStaff();
        if (!"DRAFT".equals(req.status()) && !"PUBLISHED".equals(req.status()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status");
        ClassSession s = sessions.findById(sessionId).orElseThrow(NoSuchElementException::new);
        s.setProgrammingStatus(req.status());
        sessions.save(s);
        return Map.of("programmingStatus", s.getProgrammingStatus());
    }
}
