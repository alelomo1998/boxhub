package com.boxhub.programming;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/box/program")
public class ProgramController {

    private final ProgramSlotRepository slots;
    private final TrackRepository tracks;
    private final WodRepository wods;
    private final ProgramService service;

    public ProgramController(ProgramSlotRepository slots, TrackRepository tracks, WodRepository wods,
                             ProgramService service) {
        this.slots = slots;
        this.tracks = tracks;
        this.wods = wods;
        this.service = service;
    }

    public record SlotDto(UUID id, LocalDate slotDate, UUID trackId, String trackName,
                          UUID wodId, String wodTitle, String status) {}

    record AssignRequest(@NotNull LocalDate slotDate, @NotNull UUID trackId, @NotNull UUID wodId) {}
    record StatusRequest(@NotNull String status) {}
    record PublishRequest(@NotNull LocalDate from, @NotNull LocalDate to, UUID trackId) {}

    private List<SlotDto> toDtos(List<ProgramSlot> list) {
        Map<UUID, String> trackNames = tracks.findAll().stream()
                .collect(Collectors.toMap(Track::getId, Track::getName));
        Map<UUID, String> wodTitles = wods.findAll().stream()
                .collect(Collectors.toMap(Wod::getId, Wod::getTitle, (a, b) -> a));
        return list.stream().map(s -> new SlotDto(s.getId(), s.getSlotDate(), s.getTrackId(),
                trackNames.get(s.getTrackId()), s.getWodId(), wodTitles.get(s.getWodId()), s.getStatus())).toList();
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<SlotDto> range(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                               @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                               @RequestParam(required = false) UUID trackId) {
        RoleGuard.requireStaff();
        List<ProgramSlot> found = trackId == null
                ? slots.findBySlotDateBetweenOrderBySlotDateAsc(from, to)
                : slots.findBySlotDateBetweenAndTrackIdOrderBySlotDateAsc(from, to, trackId);
        return toDtos(found);
    }

    @PutMapping
    public SlotDto assign(@Valid @RequestBody AssignRequest req) {
        RoleGuard.requireStaff();
        ProgramSlot s = service.assign(req.slotDate(), req.trackId(), req.wodId());
        return toDtos(List.of(s)).get(0);
    }

    @PatchMapping("/{id}")
    public SlotDto patch(@PathVariable UUID id, @Valid @RequestBody StatusRequest req) {
        RoleGuard.requireStaff();
        if (!"DRAFT".equals(req.status()) && !"PUBLISHED".equals(req.status()))
            throw new NoSuchElementException();
        // guard cross-tenant before mutating: foreign id looks absent
        slots.findById(id).orElseThrow(NoSuchElementException::new);
        return toDtos(List.of(service.setStatus(id, req.status()))).get(0);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        ProgramSlot s = slots.findById(id).orElseThrow(NoSuchElementException::new);
        slots.delete(s);
    }

    @PostMapping("/publish")
    public Map<String, Integer> publish(@Valid @RequestBody PublishRequest req) {
        RoleGuard.requireStaff();
        return Map.of("published", service.publishRange(req.from(), req.to(), req.trackId()));
    }
}
