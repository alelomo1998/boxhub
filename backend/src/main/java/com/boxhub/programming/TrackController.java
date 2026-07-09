package com.boxhub.programming;

import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/tracks")
public class TrackController {

    private final TrackRepository tracks;

    public TrackController(TrackRepository tracks) {
        this.tracks = tracks;
    }

    public record TrackDto(UUID id, String name, int sortOrder, boolean archived) {
        static TrackDto of(Track t) { return new TrackDto(t.getId(), t.getName(), t.getSortOrder(), t.isArchived()); }
    }

    record CreateTrackRequest(@NotBlank String name) {}
    record PatchTrackRequest(String name, Integer sortOrder, Boolean archived) {}

    @GetMapping
    public List<TrackDto> list() {
        return tracks.findByArchivedFalseOrderBySortOrderAsc().stream().map(TrackDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TrackDto create(@Valid @RequestBody CreateTrackRequest req) {
        RoleGuard.requireBoxAdmin();
        Track t = new Track();
        t.setName(req.name().trim());
        t.setSortOrder(tracks.findByArchivedFalseOrderBySortOrderAsc().size());
        try {
            return TrackDto.of(tracks.saveAndFlush(t));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Track name already exists");
        }
    }

    @PatchMapping("/{id}")
    public TrackDto patch(@PathVariable UUID id, @Valid @RequestBody PatchTrackRequest req) {
        RoleGuard.requireBoxAdmin();
        Track t = tracks.findById(id).orElseThrow(NoSuchElementException::new); // tenant filter: foreign ids look absent
        if (req.name() != null) t.setName(req.name().trim());
        if (req.sortOrder() != null) t.setSortOrder(req.sortOrder());
        if (req.archived() != null) t.setArchived(req.archived());
        try {
            return TrackDto.of(tracks.saveAndFlush(t));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Track name already exists");
        }
    }
}
