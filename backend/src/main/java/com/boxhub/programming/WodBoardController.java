package com.boxhub.programming;

import com.boxhub.shared.TenantContext;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Athlete-facing board: published WODs per track for a date. Athletes NEVER see drafts. */
@RestController
@RequestMapping("/api/box/wod-board")
public class WodBoardController {

    private final ProgramSlotRepository slots;
    private final TrackRepository tracks;
    private final WodRepository wods;
    private final WodService wodService;

    public WodBoardController(ProgramSlotRepository slots, TrackRepository tracks, WodRepository wods,
                              WodService wodService) {
        this.slots = slots;
        this.tracks = tracks;
        this.wods = wods;
        this.wodService = wodService;
    }

    public record BoardTrack(UUID trackId, String trackName, UUID slotId, WodController.WodDto wod, String status) {}
    public record BoardDto(LocalDate date, List<BoardTrack> tracks) {}

    private boolean isStaff() {
        String role = TenantContext.role();
        return "COACH".equals(role) || "BOX_ADMIN".equals(role);
    }

    @GetMapping
    @Transactional(readOnly = true)
    public BoardDto board(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                          @RequestParam(defaultValue = "false") boolean includeDrafts) {
        LocalDate d = date != null ? date : LocalDate.now();
        boolean drafts = includeDrafts && isStaff(); // athletes can never see drafts, regardless of the param

        List<ProgramSlot> daySlots = drafts
                ? slots.findBySlotDate(d)
                : slots.findBySlotDateAndStatus(d, "PUBLISHED");
        Map<UUID, Wod> wodsById = wods.findAll().stream().collect(Collectors.toMap(Wod::getId, w -> w, (a, b) -> a));
        Map<UUID, ProgramSlot> slotByTrack = daySlots.stream()
                .collect(Collectors.toMap(ProgramSlot::getTrackId, s -> s, (a, b) -> a));

        List<BoardTrack> board = tracks.findByArchivedFalseOrderBySortOrderAsc().stream()
                .map(t -> {
                    ProgramSlot s = slotByTrack.get(t.getId());
                    Wod w = s == null ? null : wodsById.get(s.getWodId());
                    return new BoardTrack(t.getId(), t.getName(), s == null ? null : s.getId(),
                            w == null ? null : wodService.toDto(w),
                            s == null ? null : s.getStatus());
                })
                .filter(bt -> bt.wod() != null || drafts) // athletes: hide empty tracks; staff preview keeps them
                .toList();
        return new BoardDto(d, board);
    }
}
