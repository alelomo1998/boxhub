package com.boxhub.programming;

import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
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
@RequestMapping("/api/box/movements")
public class MovementController {

    private final MovementRepository movements;

    public MovementController(MovementRepository movements) {
        this.movements = movements;
    }

    public record MovementDto(UUID id, String name, String category, String modality, boolean global,
                              List<String> units, boolean loadable) {
        static MovementDto of(Movement m) {
            return new MovementDto(m.getId(), m.getName(), m.getCategory(), m.getModality(), m.getBoxId() == null,
                    List.of(m.getUnits().split(",")), m.isLoadable());
        }
    }

    record CreateMovementRequest(@NotBlank String name, @NotBlank String category, String modality,
                                 List<String> units, Boolean loadable) {}
    record PatchMovementRequest(String name, String modality, Boolean active,
                                List<String> units, Boolean loadable) {}

    // wire contract is a list even though storage is a comma-separated string, so the frontend
    // never splits anything; empty rejected explicitly -- a movement with no unit can't be prescribed.
    private static List<String> validateUnits(List<String> units) {
        if (units.isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MOVEMENT_UNIT: at least one unit required");
        for (String u : units) {
            if (!Movement.UNITS.contains(u))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MOVEMENT_UNIT: unknown unit " + u);
        }
        return units;
    }

    @GetMapping
    public List<MovementDto> list(@RequestParam(required = false) String search,
                                  @RequestParam(required = false) String category) {
        // box bound explicitly (Movement is not @TenantId) -> globals + this box's custom only
        String q = search == null ? null : search.toLowerCase();
        return movements.findVisible(TenantContext.requireBoxId()).stream()
                .filter(m -> q == null || m.getName().toLowerCase().contains(q))
                .filter(m -> category == null || category.equals(m.getCategory()))
                .map(MovementDto::of)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MovementDto create(@Valid @RequestBody CreateMovementRequest req) {
        RoleGuard.requireBoxAdmin();
        Movement m = new Movement();
        m.setBoxId(TenantContext.requireBoxId());
        m.setName(req.name().trim());
        m.setCategory(req.category());
        m.setModality(req.modality());
        List<String> units = req.units() == null ? List.of("REPS") : validateUnits(req.units());
        m.setUnits(String.join(",", units));
        m.setLoadable(Boolean.TRUE.equals(req.loadable()));
        try {
            return MovementDto.of(movements.saveAndFlush(m));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Movement name already exists");
        }
    }

    @PatchMapping("/{id}")
    public MovementDto patch(@PathVariable UUID id, @Valid @RequestBody PatchMovementRequest req) {
        RoleGuard.requireBoxAdmin();
        Movement m = movements.findById(id).orElseThrow(NoSuchElementException::new);
        // custom-only: globals are immutable; foreign-box custom looks absent -> 404 (no leak)
        if (m.getBoxId() == null || !m.getBoxId().equals(TenantContext.requireBoxId()))
            throw new NoSuchElementException();
        if (req.name() != null) m.setName(req.name().trim());
        if (req.modality() != null) m.setModality(req.modality());
        if (req.active() != null) m.setActive(req.active());
        if (req.units() != null) m.setUnits(String.join(",", validateUnits(req.units())));
        if (req.loadable() != null) m.setLoadable(req.loadable());
        try {
            return MovementDto.of(movements.saveAndFlush(m));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Movement name already exists");
        }
    }
}
