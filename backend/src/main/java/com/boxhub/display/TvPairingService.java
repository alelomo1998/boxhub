package com.boxhub.display;

import com.boxhub.box.BoxRepository;
import com.boxhub.box.BoxStatusGuard;
import com.boxhub.identity.RefreshTokenService;
import com.boxhub.identity.TokenService;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

@Service
public class TvPairingService {

    public static final Duration CODE_TTL = Duration.ofMinutes(10);

    private final TvDeviceRepository devices;
    private final TokenService tokens;
    private final BoxRepository boxes;
    private final SecureRandom random = new SecureRandom();

    public TvPairingService(TvDeviceRepository devices, TokenService tokens, BoxRepository boxes) {
        this.devices = devices;
        this.tokens = tokens;
        this.boxes = boxes;
    }

    public record Created(String code, String secret) {}

    @Transactional
    public Created create() {
        String code;
        do { code = String.format("%06d", random.nextInt(1_000_000)); }
        while (devices.findByPairingCode(code).isPresent());
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        TvDevice d = new TvDevice();
        d.setPairingCode(code);
        d.setSecretHash(RefreshTokenService.sha256(secret));
        devices.save(d);
        return new Created(code, secret);
    }

    /** Empty while PENDING; token once ACTIVE. 404 unknown/bad secret, 410 expired code. */
    @Transactional(readOnly = true)
    public Optional<String> poll(String code, String secret) {
        TvDevice d = devices.findByPairingCode(code)
                .filter(x -> x.getSecretHash().equals(RefreshTokenService.sha256(secret)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("PENDING".equals(d.getStatus())) {
            if (d.getCreatedAt().plus(CODE_TTL).isBefore(Instant.now()))
                throw new ResponseStatusException(HttpStatus.GONE, "CODE_EXPIRED");
            return Optional.empty();
        }
        return Optional.of(tokens.tvToken(d.getId(), d.getBoxId()));
    }

    @Transactional
    public TvDevice claim(String code, String name) {
        TvDevice d = devices.findByPairingCode(code)
                .filter(x -> "PENDING".equals(x.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_CODE"));
        if (d.getCreatedAt().plus(CODE_TTL).isBefore(Instant.now()))
            throw new ResponseStatusException(HttpStatus.GONE, "CODE_EXPIRED");
        UUID boxId = TenantContext.requireBoxId();
        BoxStatusGuard.requireActive(boxes.findById(boxId).orElseThrow());
        d.setBoxId(boxId);
        d.setName(name);
        d.setStatus("ACTIVE");
        // keep pairing_code so the TV's in-flight poll can still find the row; poll returns the token.
        return devices.save(d);
    }
}
