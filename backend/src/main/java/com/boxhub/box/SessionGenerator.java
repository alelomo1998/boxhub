package com.boxhub.box;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;

import java.time.*;
import java.util.UUID;

/**
 * Materializes concrete class_sessions from active templates up to the box's booking horizon.
 * Runs on template create/reactivate (tenant already set) and nightly for every box.
 * The nightly path has no ambient tenant, so it establishes a synthetic box tenant per box
 * so the @TenantId box_id on ClassSession populates correctly (see ADR-001).
 */
@Service
public class SessionGenerator {

    private final ClassTemplateRepository templates;
    private final ClassSessionRepository sessions;
    private final BoxRepository boxes;
    private final TransactionTemplate tx;

    public SessionGenerator(ClassTemplateRepository templates, ClassSessionRepository sessions,
                            BoxRepository boxes, PlatformTransactionManager txManager) {
        this.templates = templates;
        this.sessions = sessions;
        this.boxes = boxes;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Generate for one box. NOT @Transactional: the tenant must be established (runAsBox) BEFORE the
     * Hibernate session opens, or @TenantId resolves to the NO_TENANT sentinel. So we set the tenant
     * first, then open the tx via TransactionTemplate inside it.
     */
    public void generateForBox(UUID boxId) {
        Box box = boxes.findById(boxId).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        int horizonWeeks = box.getBookingHorizonWeeks();
        runAsBox(boxId, () -> tx.executeWithoutResult(status -> {
            for (ClassTemplate t : templates.findByActiveTrue()) {
                generateForTemplate(t, tz, horizonWeeks);
            }
        }));
    }

    /** Assumes the current tenant is the template's box (create path sets it; generateForBox sets it). */
    public void generateForTemplate(ClassTemplate t, ZoneId tz, int horizonWeeks) {
        DayOfWeek target = DayOfWeek.of(t.getWeekday() + 1); // 0=Mon -> MONDAY(1)
        LocalDate today = LocalDate.now(tz);
        LocalDate end = today.plusWeeks(horizonWeeks);
        for (LocalDate d = today; !d.isAfter(end); d = d.plusDays(1)) {
            if (d.getDayOfWeek() != target) continue;
            Instant startAt = ZonedDateTime.of(d, t.getStartTime(), tz).toInstant();
            if (startAt.isBefore(Instant.now())) continue;                       // don't materialize past slots
            if (sessions.existsByTemplateIdAndStartAt(t.getId(), startAt)) continue; // idempotent
            ClassSession s = new ClassSession();
            s.setTemplateId(t.getId());
            s.setName(t.getName());
            s.setStartAt(startAt);
            s.setDurationMin(t.getDurationMin());
            s.setCapacity(t.getCapacity());
            s.setCoachId(t.getCoachId());
            sessions.save(s);
        }
    }

    /** Nightly: every box up to its horizon. Cron won't fire during short test runs. */
    @Scheduled(cron = "0 0 3 * * *")
    public void generateAll() {
        for (Box b : boxes.findAll()) {
            generateForBox(b.getId());
        }
    }

    private void runAsBox(UUID boxId, Runnable r) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("system").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
            r.run();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }
}
