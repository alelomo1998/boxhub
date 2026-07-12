package com.boxhub.display;

import com.boxhub.shared.RoleGuard;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/box/tv")
public class TvAdminController {

    private final TvPairingService pairing;
    private final TvDeviceRepository devices;

    public TvAdminController(TvPairingService pairing, TvDeviceRepository devices) {
        this.pairing = pairing;
        this.devices = devices;
    }

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

    @GetMapping
    public java.util.List<DeviceDto> list() {
        RoleGuard.requireStaff();
        return devices.findByBoxIdOrderByCreatedAtAsc(com.boxhub.shared.TenantContext.requireBoxId())
                .stream().filter(d -> "ACTIVE".equals(d.getStatus())).map(TvAdminController::toDto).toList();
    }

    @PatchMapping("/{id}")
    public DeviceDto rename(@PathVariable java.util.UUID id, @RequestBody java.util.Map<String, String> body) {
        RoleGuard.requireStaff();
        TvDevice d = owned(id);
        d.setName(body.get("name"));
        return toDto(devices.save(d));
    }

    @DeleteMapping("/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void remove(@PathVariable java.util.UUID id) {
        RoleGuard.requireStaff();
        TvDevice d = owned(id);
        d.setStatus("REVOKED");
        d.setPairingCode(null);
        devices.save(d);
        // M6-T5: disconnect emitter here (TvStreamService.disconnect(id))
    }

    /** tv_devices is not @TenantId — ownership is this explicit box_id check. */
    private TvDevice owned(java.util.UUID id) {
        return devices.findById(id)
                .filter(d -> com.boxhub.shared.TenantContext.requireBoxId().equals(d.getBoxId()))
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND));
    }
}
