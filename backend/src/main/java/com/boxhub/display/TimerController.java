package com.boxhub.display;

import com.boxhub.shared.RoleGuard;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/box/sessions/{sessionId}/timer")
public class TimerController {

    private final TimerService service;
    public TimerController(TimerService service) { this.service = service; }

    public record TimerDto(String specJson, String status, Long startedAtEpoch, long pausedElapsedMs, UUID sessionItemId) {}
    record TimerAction(String action, UUID itemId, JsonNode spec) {}

    private static TimerDto toDto(ClassTimer t) {
        return new TimerDto(t.getSpecJson(), t.getStatus(), t.getStartedAtEpoch(), t.getPausedElapsedMs(), t.getSessionItemId());
    }

    @GetMapping
    public ResponseEntity<TimerDto> get(@PathVariable UUID sessionId) {
        RoleGuard.requireStaff();
        return service.get(sessionId).map(t -> ResponseEntity.ok(toDto(t)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping
    public TimerDto act(@PathVariable UUID sessionId, @RequestBody TimerAction req) {
        RoleGuard.requireStaff();
        String specJson = req.spec() == null ? null : req.spec().toString();
        return toDto(service.act(sessionId, req.action(), req.itemId(), specJson));
    }
}
