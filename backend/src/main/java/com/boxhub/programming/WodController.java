package com.boxhub.programming;

import com.boxhub.box.BoxRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/wods")
public class WodController {

    private final WodRepository wods;
    private final SessionItemRepository items;
    private final WodService service;
    private final BoxRepository boxes;

    public WodController(WodRepository wods, SessionItemRepository items, WodService service, BoxRepository boxes) {
        this.wods = wods;
        this.items = items;
        this.service = service;
        this.boxes = boxes;
    }

    public record WodDto(UUID id, String title, String wodType,
                         String macro, String timingPreset, WodJson.Timing timing,
                         boolean library, int teamSize, String teamShare,
                         String scoreType, Integer timeCapSeconds,
                         String bodyText, WodJson.Blocks blocks, String scalingNotes,
                         UUID benchmarkTemplateId) {}

    WodDto toDto(Wod w) {
        return service.toDto(w);
    }

    record CreateWodRequest(@NotBlank String title, String wodType,
                            String macro, String timingPreset, WodJson.Timing timing,
                            Integer teamSize, String teamShare, Boolean library,
                            @NotBlank String scoreType, Integer timeCapSeconds,
                            String bodyText, WodJson.Blocks blocks, String scalingNotes) {}

    record PatchWodRequest(String title, String wodType,
                           String macro, String timingPreset, WodJson.Timing timing,
                           Integer teamSize, String teamShare, Boolean saveToLibrary,
                           String scoreType, Integer timeCapSeconds,
                           String bodyText, WodJson.Blocks blocks, String scalingNotes) {}

    /**
     * Precedence: an explicit macro wins and is used verbatim; otherwise both axes are derived
     * from the legacy wodType exactly as before. This is what makes the wire additive -- and it
     * is the whole CIRCUIT/CUSTOM/SKILL fix, because the rebuilt editor sends macro and therefore
     * never round-trips through WodTypeWire's deliberately lossy composition.
     */
    private void applyAxes(Wod w, String macro, String timingPreset, String wodType) {
        if (macro != null && !macro.isBlank()) {
            if (!Macros.ALL.contains(macro))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown macro");
            if (timingPreset != null && !TimingPresets.ALL.contains(timingPreset))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown timing preset");
            w.setMacro(macro);
            w.setTimingPreset(timingPreset);
        } else if (wodType != null && !wodType.isBlank()) {
            if (!PieceTypes.ALL.contains(wodType))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown wod type");
            w.setMacro(WodTypeWire.toMacro(wodType));
            w.setTimingPreset(WodTypeWire.toTimingPreset(wodType));
        }
    }

    /** team_share is null exactly when team_size is 1 (spec 5.1). */
    private void applyTeam(Wod w, Integer teamSize, String teamShare) {
        if (teamSize == null) return;
        if (teamSize < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Team size must be at least 1");
        w.setTeamSize(teamSize);
        w.setTeamShare(teamSize == 1 ? null : teamShare);
    }

    @GetMapping
    public List<WodDto> list(@RequestParam(required = false) String search) {
        // library = true only: a class's own copy is not a library entry, and listing copies is
        // how the library floods once pieces are attached by copy (spec 4, part 1).
        List<Wod> found = (search == null || search.isBlank())
                ? wods.findByLibraryTrueOrderByUpdatedAtDesc()
                : wods.findByLibraryTrueAndTitleContainingIgnoreCaseOrderByUpdatedAtDesc(search);
        return found.stream().map(this::toDto).toList();
    }

    @GetMapping("/{id}")
    public WodDto get(@PathVariable UUID id) {
        return toDto(wods.findById(id).orElseThrow(NoSuchElementException::new));
    }

    public record HistoryRowDto(UUID itemId, UUID sessionId, String className, Instant startAt, WodDto wod) {}

    @GetMapping("/history")
    public List<HistoryRowDto> history(@RequestParam String day) {
        RoleGuard.requireStaff();
        LocalDate date;
        try { date = LocalDate.parse(day); }
        catch (java.time.format.DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "day must be YYYY-MM-DD");
        }
        // The box's own day, not the server's: a 23:30 class in Rome is "today" there.
        ZoneId zone = ZoneId.of(boxes.findById(TenantContext.requireBoxId()).orElseThrow().getTimezone());
        Instant from = date.atStartOfDay(zone).toInstant();
        Instant to = date.plusDays(1).atStartOfDay(zone).toInstant();
        return items.history(from, to, service.now()).stream()
                .map(r -> new HistoryRowDto(r.itemId(), r.sessionId(), r.className(), r.startAt(), toDto(r.wod())))
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WodDto create(@Valid @RequestBody CreateWodRequest req) {
        RoleGuard.requireStaff();
        if (req.macro() == null && req.wodType() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give a macro or a wodType");
        Wod w = new Wod();
        w.setTitle(req.title().trim());
        applyAxes(w, req.macro(), req.timingPreset(), req.wodType());
        applyTeam(w, req.teamSize(), req.teamShare());
        w.setLibrary(req.library() == null || req.library()); // null -> true, preserving today's behaviour
        w.setScoreType(req.scoreType());
        w.setTimeCapSeconds(req.timeCapSeconds());
        if (req.bodyText() != null) w.setBodyText(req.bodyText());
        w.setBlocksJson(service.serialize(req.blocks()));
        w.setTimingJson(service.serializeTiming(req.timing()));  // was: always Timing.empty()
        w.setScalingNotes(req.scalingNotes());
        w.setCreatedBy(TenantContext.userId());
        return toDto(wods.save(w));
    }

    @PatchMapping("/{id}")
    public WodDto patch(@PathVariable UUID id, @Valid @RequestBody PatchWodRequest req) {
        RoleGuard.requireStaff();
        Wod w = wods.findById(id).orElseThrow(NoSuchElementException::new);
        if (req.title() != null) w.setTitle(req.title().trim());
        applyAxes(w, req.macro(), req.timingPreset(), req.wodType());
        applyTeam(w, req.teamSize(), req.teamShare());
        if (req.timing() != null) w.setTimingJson(service.serializeTiming(req.timing()));
        if (req.scoreType() != null) w.setScoreType(req.scoreType());
        if (req.timeCapSeconds() != null) w.setTimeCapSeconds(req.timeCapSeconds());
        if (req.bodyText() != null) w.setBodyText(req.bodyText());
        if (req.blocks() != null) w.setBlocksJson(service.serialize(req.blocks()));
        if (req.scalingNotes() != null) w.setScalingNotes(req.scalingNotes());
        w.setUpdatedAt(Instant.now());
        Wod saved = wods.save(w);
        // Default OFF: an ordinary edit of a class's own piece never reaches the library. When it
        // is asked for, source_wod_id makes the second save update the row the first one made.
        if (Boolean.TRUE.equals(req.saveToLibrary())) service.saveToLibrary(saved.getId());
        return toDto(saved);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        Wod w = wods.findById(id).orElseThrow(NoSuchElementException::new);
        if (items.existsByWodId(w.getId()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "WOD in use");
        wods.delete(w);
    }
}
