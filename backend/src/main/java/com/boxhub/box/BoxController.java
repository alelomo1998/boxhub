package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class BoxController {

    private final BoxRepository boxes;

    public BoxController(BoxRepository boxes) {
        this.boxes = boxes;
    }

    record CurrentBoxResponse(UUID id, String name, String slug, String timezone, String role) {}

    @GetMapping("/api/box/current")
    public CurrentBoxResponse current() {
        Box b = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        return new CurrentBoxResponse(b.getId(), b.getName(), b.getSlug(), b.getTimezone(),
                TenantContext.role());
    }
}
