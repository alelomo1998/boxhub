package com.boxhub.identity;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;

/**
 * Per-account exponential backoff. The counter lives on the user row, so it is durable
 * across restarts and — unlike the per-IP filter — a rotating IP pool does not defeat it.
 *
 * It NEVER becomes a permanent lock. A hard lock would hand an attacker a free denial of
 * service: type ten bad passwords at a box owner's address and they cannot get into their
 * own gym before class. The window caps and heals on its own.
 */
@Service
public class LoginThrottleService {

    private static final Duration MAX = Duration.ofMinutes(15);

    private final UserRepository users;

    public LoginThrottleService(UserRepository users) {
        this.users = users;
    }

    public void assertNotThrottled(User user) {
        Instant until = user.getThrottledUntil();
        if (until != null && until.isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS");
    }

    /** REQUIRES_NEW: the failure must persist even though the login transaction throws. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(User user) {
        User u = users.findById(user.getId()).orElseThrow();
        int n = u.getFailedAttempts() + 1;
        u.setFailedAttempts(n);
        u.setThrottledUntil(n >= 5 ? Instant.now().plus(backoff(n)) : null);
        users.save(u);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSuccess(User user) {
        User u = users.findById(user.getId()).orElseThrow();
        u.setFailedAttempts(0);
        u.setThrottledUntil(null);
        users.save(u);
    }

    static Duration backoff(int failures) {
        if (failures < 5) return Duration.ZERO;
        if (failures < 10) return Duration.ofMinutes(1);
        if (failures < 15) return Duration.ofMinutes(5);
        return MAX;
    }
}
