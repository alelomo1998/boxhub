package com.boxhub.display;

import com.boxhub.shared.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One SseEmitter per connected TV. In-memory, single-node (consistent with the
 * no-Redis rule; noted in BACKLOG). Snapshots are idempotent full states.
 */
@Service
public class TvStreamService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(TvStreamService.class);

    private final TvStateService state;
    private final TvDeviceRepository devices;
    private final ObjectMapper json = new ObjectMapper()
            .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private record Conn(UUID boxId, SseEmitter emitter) {}
    private final Map<UUID, Conn> connections = new ConcurrentHashMap<>();

    public TvStreamService(TvStateService state, TvDeviceRepository devices) {
        this.state = state;
        this.devices = devices;
    }

    public SseEmitter connect(TvDevice device) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout; nginx read timeout governs
        UUID id = device.getId();
        connections.put(id, new Conn(device.getBoxId(), emitter));
        emitter.onCompletion(() -> connections.remove(id));
        emitter.onError(e -> connections.remove(id));
        push(id); // initial snapshot, synchronous
        touch(device);
        return emitter;
    }

    public void disconnect(UUID deviceId) {
        Conn c = connections.remove(deviceId);
        // may already be completed by a concurrent push() error — a revoke must not 500
        if (c != null) try { c.emitter().complete(); } catch (Exception ignored) { }
    }

    /** Suspend kills the room now, not at next reconnect. */
    public void disconnectBox(UUID boxId) {
        connections.forEach((id, c) -> { if (c.boxId().equals(boxId)) disconnect(id); });
    }

    @EventListener
    public void onChange(TvStateChanged ev) { pushBox(ev.boxId()); }

    public void pushBox(UUID boxId) {
        connections.forEach((id, c) -> { if (c.boxId().equals(boxId)) push(id); });
    }

    /** 30s sweep: re-push everything (catches bookings/publishes/session rollover) + heartbeat last_seen. */
    @Scheduled(fixedDelay = 30_000)
    public void sweep() {
        connections.forEach((id, c) -> {
            push(id);
            devices.findById(id).ifPresent(this::touch);
        });
    }

    private void touch(TvDevice d) {
        d.setLastSeenAt(Instant.now());
        devices.save(d);
    }

    private void push(UUID deviceId) {
        Conn c = connections.get(deviceId);
        if (c == null) return;
        try {
            // tenant BEFORE compose: without it compose()'s @TenantId reads have no ambient
            // tenant. Pre-M21 that leaked every box; since M21 it returns empty and the board goes
            // blank instead. Wrong either way — the fix is the same one (ADR-001 + its M21 amendment).
            TvStateService.TvState snapshot = TenantContext.runAsBox(c.boxId(), () -> state.compose(c.boxId()));
            c.emitter().send(SseEmitter.event().name("state").data(json.writeValueAsString(snapshot)));
        } catch (Exception e) {
            // A dropped TV used to vanish with no trace: the board silently stops updating and the
            // only symptom is a stale screen in a gym. Logged at WARN because it is not normal —
            // a genuine client disconnect arrives through onCompletion/onError, not through here.
            // Device id and box id only, never the state payload.
            log.warn("tv push failed for device {} in box {}; dropping the connection", deviceId, c.boxId(), e);
            connections.remove(deviceId);
            // a concurrent disconnect() may have completed this emitter already; a registry-cleanup
            // failure must never escape into the request thread that published the event
            try { c.emitter().completeWithError(e); } catch (Exception ignored) { }
        }
    }
}
