package com.boxhub.display;

import com.boxhub.identity.CookieService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/tv")
public class TvPublicController {

    private final TvPairingService pairing;
    private final CookieService cookies;

    public TvPublicController(TvPairingService pairing, CookieService cookies) {
        this.pairing = pairing;
        this.cookies = cookies;
    }

    record PollRequest(String code, String secret) {}
    record PollResponse(boolean paired) {}

    @PostMapping("/pair")
    public Map<String, String> pair() {
        TvPairingService.Created c = pairing.create();
        return Map.of("code", c.code(), "secret", c.secret());
    }

    /** On claim, the device token rides home as the httpOnly bh_tv cookie (M11 T5) — never in
     *  the response body, so it never lands anywhere JS or a log can read it back out. */
    @PostMapping("/pair/poll")
    public ResponseEntity<PollResponse> poll(@RequestBody PollRequest req) {
        return pairing.poll(req.code(), req.secret())
                .map(t -> ResponseEntity.ok()
                        .header(HttpHeaders.SET_COOKIE, cookies.tv(t).toString())
                        .body(new PollResponse(true)))
                .orElseGet(() -> ResponseEntity.accepted().build());
    }
}
