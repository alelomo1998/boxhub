package com.boxhub.identity;

import com.boxhub.shared.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/me")
public class AccountController {

    private final AccountService accounts;
    private final RefreshTokenService refreshTokens;
    private final TokenService tokens;
    private final CookieService cookies;

    public AccountController(AccountService accounts, RefreshTokenService refreshTokens,
                             TokenService tokens, CookieService cookies) {
        this.accounts = accounts;
        this.refreshTokens = refreshTokens;
        this.tokens = tokens;
        this.cookies = cookies;
    }

    // Every record below redacts toString() for the reason documented on
    // AuthController.RegisterRequest: Spring MVC logs the deserialized @RequestBody at DEBUG on
    // org.springframework.web, so a default record toString() writes plaintext passwords and
    // single-use tokens into the log file. LogHygieneTest guards this.
    record PasswordChangeRequest(@NotBlank String currentPassword,
                                 @NotBlank @Size(min = 10, max = 100) String newPassword) {
        @Override public String toString() { return "PasswordChangeRequest[currentPassword=***, newPassword=***]"; }
    }
    record EmailChangeRequest(@NotBlank String password, @NotBlank @Email String newEmail) {
        @Override public String toString() { return "EmailChangeRequest[password=***, newEmail=" + newEmail + "]"; }
    }
    record TokenRequest(@NotBlank String token) {
        @Override public String toString() { return "TokenRequest[token=***]"; }
    }
    /** password is optional — a passwordless (Google-only) account has nothing to verify. */
    record DeleteRequest(String password) {
        @Override public String toString() { return "DeleteRequest[password=***]"; }
    }

    /**
     * A password change is how you evict someone who is already inside, so it revokes every
     * session — then hands the caller a fresh one so they are not logged out of their own
     * password change.
     */
    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordChangeRequest req,
                                               HttpServletRequest http) {
        User u = accounts.changePassword(TenantContext.userId(), req.currentPassword(), req.newPassword());
        refreshTokens.revokeAllFor(u.getId());
        String refresh = refreshTokens.issue(u, http.getHeader(HttpHeaders.USER_AGENT), AuthController.clientIp(http));

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.access(tokens.userToken(u)).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString())
                .build();
    }

    @PostMapping("/email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void startEmailChange(@Valid @RequestBody EmailChangeRequest req) {
        accounts.startEmailChange(TenantContext.userId(), req.password(), req.newEmail());
    }

    /** permitAll — the link is clicked from an inbox, possibly on a device with no session. */
    @PostMapping("/email/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmEmailChange(@Valid @RequestBody TokenRequest req) {
        accounts.completeEmailChange(req.token());
    }

    @GetMapping("/export")
    public Map<String, Object> export() {
        return accounts.export(TenantContext.userId());
    }

    /**
     * Anonymize, then clear the cookies — they now point at a person who no longer exists.
     * Body is optional (required = false) so a bodyless DELETE still binds; a passwordless
     * (Google-only) caller sends none and req is null.
     */
    @DeleteMapping
    public ResponseEntity<Void> delete(@RequestBody(required = false) DeleteRequest req) {
        accounts.anonymize(TenantContext.userId(), req == null ? null : req.password());
        ResponseEntity.BodyBuilder b = ResponseEntity.status(HttpStatus.NO_CONTENT);
        for (org.springframework.http.ResponseCookie c : cookies.clearAll())
            b.header(HttpHeaders.SET_COOKIE, c.toString());
        return b.build();
    }
}
