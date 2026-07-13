package com.boxhub.display;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One SseEmitter per connected TV. In-memory, single-node (consistent with the
 * no-Redis rule; noted in BACKLOG). Snapshots are idempotent full states.
 */
@Service
public class TvStreamService {

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
            // tenant BEFORE compose: @TenantId reads fail open to root without it (ADR-001)
            TvStateService.TvState snapshot = runAsBox(c.boxId(), () -> state.compose(c.boxId()));
            c.emitter().send(SseEmitter.event().name("state").data(json.writeValueAsString(snapshot)));
        } catch (Exception e) {
            connections.remove(deviceId);
            // a concurrent disconnect() may have completed this emitter already; a registry-cleanup
            // failure must never escape into the request thread that published the event
            try { c.emitter().completeWithError(e); } catch (Exception ignored) { }
        }
    }

    private <T> T runAsBox(UUID boxId, java.util.function.Supplier<T> s) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("tv-push").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
            return s.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }
}
