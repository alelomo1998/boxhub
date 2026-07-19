package com.boxhub.display;

import com.boxhub.box.BoxRepository;
import com.boxhub.box.BoxStatusGuard;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

@RestController
public class TvStreamController {

    private final JwtDecoder jwtDecoder;
    private final TvDeviceRepository devices;
    private final BoxRepository boxes;
    private final TvStreamService stream;

    public TvStreamController(JwtDecoder jwtDecoder, TvDeviceRepository devices, BoxRepository boxes,
                               TvStreamService stream) {
        this.jwtDecoder = jwtDecoder;
        this.devices = devices;
        this.boxes = boxes;
        this.stream = stream;
    }

    /** EventSource can't set headers → token as query param (accepted pilot risk, BACKLOG). */
    @GetMapping(value = "/api/tv/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam String token, HttpServletResponse response) {
        Jwt jwt;
        try { jwt = jwtDecoder.decode(token); }
        catch (Exception e) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED); }
        if (!"tv".equals(jwt.getClaimAsString("scope")))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        TvDevice device = devices.findById(UUID.fromString(jwt.getClaimAsString("device_id")))
                .filter(d -> "ACTIVE".equals(d.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        BoxStatusGuard.requireReachable(boxes.findById(device.getBoxId()).orElseThrow());
        response.setHeader("X-Accel-Buffering", "no");
        return stream.connect(device);
    }
}
