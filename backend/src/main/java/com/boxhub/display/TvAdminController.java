package com.boxhub.display;

import com.boxhub.shared.RoleGuard;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/box/tv")
public class TvAdminController {

    private final TvPairingService pairing;

    public TvAdminController(TvPairingService pairing) { this.pairing = pairing; }

    record ClaimRequest(String code, String name) {}
    record DeviceDto(java.util.UUID id, String name, boolean online, java.time.Instant lastSeenAt, java.time.Instant createdAt) {}

    static DeviceDto toDto(TvDevice d) {
        boolean online = d.getLastSeenAt() != null
                && d.getLastSeenAt().isAfter(java.time.Instant.now().minusSeconds(90));
        return new DeviceDto(d.getId(), d.getName(), online, d.getLastSeenAt(), d.getCreatedAt());
    }

    @PostMapping("/claim")
    public DeviceDto claim(@RequestBody ClaimRequest req) {
        RoleGuard.requireStaff();
        return toDto(pairing.claim(req.code(), req.name()));
    }
}
