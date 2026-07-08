package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class BoxController {

    private final BoxRepository boxes;

    public BoxController(BoxRepository boxes) {
        this.boxes = boxes;
    }

    record CurrentBoxResponse(UUID id, String name, String slug, String timezone, String logoUrl, String role) {}

    @GetMapping("/api/box/current")
    public CurrentBoxResponse current() {
        Box b = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        return new CurrentBoxResponse(b.getId(), b.getName(), b.getSlug(), b.getTimezone(),
                b.getLogoUrl(), TenantContext.role());
    }

    record PatchSettingsRequest(String name, String timezone, String logoUrl) {}

    @PatchMapping("/api/box/settings")
    public CurrentBoxResponse patchSettings(@RequestBody PatchSettingsRequest req) {
        RoleGuard.requireBoxAdmin();
        Box b = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        if (req.name() != null && !req.name().isBlank()) b.setName(req.name().trim());
        if (req.timezone() != null && !req.timezone().isBlank()) b.setTimezone(req.timezone().trim());
        if (req.logoUrl() != null) b.setLogoUrl(req.logoUrl().isBlank() ? null : req.logoUrl().trim());
        boxes.save(b);
        return new CurrentBoxResponse(b.getId(), b.getName(), b.getSlug(), b.getTimezone(),
                b.getLogoUrl(), TenantContext.role());
    }
}
