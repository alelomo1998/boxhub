package com.boxhub.programming;

import com.boxhub.box.ScheduleSlot;
import com.boxhub.box.ScheduleSlotRepository;
import com.boxhub.shared.RoleGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/** Skeleton (structure mock-up) of a class type. Never shown to athletes; pre-seeds the builder. */
@RestController
@RequestMapping("/api/box/class-templates/{templateId}/skeleton")
public class SkeletonController {

    private final TemplatePieceRepository pieces;
    private final ScheduleSlotRepository slots;

    public SkeletonController(TemplatePieceRepository pieces, ScheduleSlotRepository slots) {
        this.pieces = pieces;
        this.slots = slots;
    }

    public record PieceDto(UUID id, int sortOrder, String label, String wodType) {}
    record PieceInput(@NotBlank String label, @NotBlank String wodType) {}
    record SkeletonRequest(@NotNull List<PieceInput> pieces) {}

    /** {templateId} is the class-templates resource id (a schedule_slot id); the skeleton lives on its class type. */
    private UUID classTypeId(UUID templateId) {
        ScheduleSlot slot = slots.findById(templateId).orElseThrow(NoSuchElementException::new);
        return slot.getClassTypeId();
    }

    @GetMapping
    public List<PieceDto> get(@PathVariable UUID templateId) {
        RoleGuard.requireStaff();
        UUID classTypeId = classTypeId(templateId);
        return pieces.findByClassTypeIdOrderBySortOrderAsc(classTypeId).stream()
                .map(p -> new PieceDto(p.getId(), p.getSortOrder(), p.getLabel(), p.getWodType())).toList();
    }

    @PutMapping
    @Transactional
    public List<PieceDto> put(@PathVariable UUID templateId, @Valid @RequestBody SkeletonRequest req) {
        RoleGuard.requireStaff();
        UUID classTypeId = classTypeId(templateId);
        for (PieceInput in : req.pieces()) {
            if (!PieceTypes.ALL.contains(in.wodType()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown piece type");
        }
        pieces.deleteByClassTypeId(classTypeId);
        pieces.flush();
        int sort = 0;
        for (PieceInput in : req.pieces()) {
            TemplatePiece p = new TemplatePiece();
            p.setClassTypeId(classTypeId);
            p.setSortOrder(sort++);
            p.setLabel(in.label().trim());
            p.setWodType(in.wodType());
            pieces.save(p);
        }
        return get(templateId);
    }
}
