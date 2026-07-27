package com.boxhub.display;

import com.boxhub.identity.CookieService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tv")
public class TvPublicController {

    private final TvPairingService pairing;
    private final CookieService cookies;

    public TvPublicController(TvPairingService pairing, CookieService cookies) {
        this.pairing = pairing;
        this.cookies = cookies;
    }

    /** secret redacted — see AuthController.RegisterRequest: Spring MVC logs the deserialized
     *  @RequestBody at DEBUG, and this secret is the whole credential for claiming a paired TV. */
    record PollRequest(String code, String secret) {
        @Override public String toString() { return "PollRequest[code=" + code + ", secret=***]"; }
    }
    record PollResponse(boolean paired) {}

    /** Same JSON as the {@code Map.of("code", …, "secret", …)} this replaced, but a record can
     *  redact toString() — and it has to: Spring MVC logs the RESPONSE body too
     *  ({@code Writing [<return value>]} at DEBUG), so a bare Map put the pairing secret in the log. */
    record PairResponse(String code, String secret) {
        @Override public String toString() { return "PairResponse[code=" + code + ", secret=***]"; }
    }

    @PostMapping("/pair")
    public PairResponse pair() {
        TvPairingService.Created c = pairing.create();
        return new PairResponse(c.code(), c.secret());
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
