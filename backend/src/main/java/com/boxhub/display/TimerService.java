package com.boxhub.display;

import com.boxhub.box.ClassSessionRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
public class TimerService {

    private final ClassTimerRepository timers;
    private final ClassSessionRepository sessions;
    private final ApplicationEventPublisher events;

    public TimerService(ClassTimerRepository timers, ClassSessionRepository sessions, ApplicationEventPublisher events) {
        this.timers = timers; this.sessions = sessions; this.events = events;
    }

    @Transactional(readOnly = true)
    public Optional<ClassTimer> get(UUID sessionId) {
        sessions.findById(sessionId).orElseThrow(NoSuchElementException::new); // in-tenant or 404
        return timers.findBySessionId(sessionId);
    }

    @Transactional
    public ClassTimer act(UUID sessionId, String action, UUID itemId, String specJson) {
        sessions.findById(sessionId).orElseThrow(NoSuchElementException::new); // in-tenant or 404
        ClassTimer t = timers.findBySessionId(sessionId).orElse(null);
        long now = Instant.now().toEpochMilli();
        switch (action) {
            case "ARM" -> {
                if (specJson == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "spec required");
                if (t == null) { t = new ClassTimer(); t.setSessionId(sessionId); }
                t.setSessionItemId(itemId);
                t.setSpecJson(specJson);
                t.setStatus("PENDING"); t.setStartedAtEpoch(null); t.setPausedElapsedMs(0);
            }
            case "START", "RESUME" -> {
                t = require(t);
                if (!"RUNNING".equals(t.getStatus())) { t.setStartedAtEpoch(now); t.setStatus("RUNNING"); }
            }
            case "PAUSE" -> {
                t = require(t);
                if ("RUNNING".equals(t.getStatus()) && t.getStartedAtEpoch() != null) {
                    t.setPausedElapsedMs(t.getPausedElapsedMs() + (now - t.getStartedAtEpoch()));
                }
                t.setStartedAtEpoch(null); t.setStatus("PAUSED");
            }
            case "RESET" -> {
                t = require(t);
                t.setStartedAtEpoch(null); t.setPausedElapsedMs(0); t.setStatus("PENDING");
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown action");
        }
        t.setUpdatedAt(Instant.now());
        ClassTimer saved = timers.save(t);
        events.publishEvent(new TvStateChanged(TenantContext.requireBoxId()));
        return saved;
    }

    private ClassTimer require(ClassTimer t) {
        if (t == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "no armed timer");
        return t;
    }
}
