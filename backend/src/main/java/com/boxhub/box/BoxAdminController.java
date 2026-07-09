package com.boxhub.box;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/boxes")
public class BoxAdminController {

    private final BoxRepository boxes;
    private final com.boxhub.programming.TrackService trackService;

    public BoxAdminController(BoxRepository boxes, com.boxhub.programming.TrackService trackService) {
        this.boxes = boxes;
        this.trackService = trackService;
    }

    record CreateBoxRequest(@NotBlank String name,
                            @NotBlank @Pattern(regexp = "[a-z0-9-]{3,40}") String slug,
                            @NotBlank String timezone) {}

    record BoxDto(UUID id, String name, String slug, String timezone) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BoxDto create(@Valid @RequestBody CreateBoxRequest req) {
        Box b = new Box();
        b.setName(req.name().trim());
        b.setSlug(req.slug());
        b.setTimezone(req.timezone());
        try {
            b = boxes.saveAndFlush(b);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Slug already taken");
        }
        trackService.seedDefaults(b.getId()); // RX + Fitness for the new box
        return new BoxDto(b.getId(), b.getName(), b.getSlug(), b.getTimezone());
    }
}
