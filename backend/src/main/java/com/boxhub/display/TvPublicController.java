package com.boxhub.display;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/tv")
public class TvPublicController {

    private final TvPairingService pairing;

    public TvPublicController(TvPairingService pairing) { this.pairing = pairing; }

    record PollRequest(String code, String secret) {}

    @PostMapping("/pair")
    public Map<String, String> pair() {
        TvPairingService.Created c = pairing.create();
        return Map.of("code", c.code(), "secret", c.secret());
    }

    @PostMapping("/pair/poll")
    public ResponseEntity<Map<String, String>> poll(@RequestBody PollRequest req) {
        return pairing.poll(req.code(), req.secret())
                .map(t -> ResponseEntity.ok(Map.of("token", t)))
                .orElseGet(() -> ResponseEntity.accepted().build());
    }
}
