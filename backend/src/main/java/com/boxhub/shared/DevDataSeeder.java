package com.boxhub.shared;

import com.boxhub.box.Announcement;
import com.boxhub.box.AnnouncementRepository;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.box.ClassTemplate;
import com.boxhub.box.ClassTemplateRepository;
import com.boxhub.box.SessionGenerator;
import com.boxhub.identity.*;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
import com.boxhub.programming.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final AuthService authService;
    private final ClassTemplateRepository templates;
    private final ClassSessionRepository sessions;
    private final SessionGenerator sessionGenerator;
    private final TemplatePieceRepository skeletons;
    private final SessionItemRepository items;
    private final WodRepository wods;
    private final MovementRepository movements;
    private final WodScoreRepository wodScores;
    private final LiftEntryRepository liftEntries;
    private final AnnouncementRepository announcements;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService,
                         ClassTemplateRepository templates, ClassSessionRepository sessions,
                         SessionGenerator sessionGenerator, TemplatePieceRepository skeletons,
                         SessionItemRepository items, WodRepository wods, MovementRepository movements,
                         WodScoreRepository wodScores, LiftEntryRepository liftEntries,
                         AnnouncementRepository announcements) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.authService = authService;
        this.templates = templates;
        this.sessions = sessions;
        this.sessionGenerator = sessionGenerator;
        this.skeletons = skeletons;
        this.items = items;
        this.wods = wods;
        this.movements = movements;
        this.wodScores = wodScores;
        this.liftEntries = liftEntries;
        this.announcements = announcements;
    }

    @Override
    public void run(String... args) {
        if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;
        Box demo = new Box();
        demo.setName("Demo Box");
        demo.setSlug("demo");
        demo.setTimezone("Europe/Rome");
        boxes.save(demo);
        seed(demo, "admin@demo.io", "Demo Admin", "BOX_ADMIN");
        User coach = seed(demo, "coach@demo.io", "Demo Coach", "COACH");
        User athlete = seed(demo, "athlete@demo.io", "Demo Athlete", "ATHLETE");
        User athlete2 = seed(demo, "athlete2@demo.io", "Sam Rivera", "ATHLETE");
        User athlete3 = seed(demo, "athlete3@demo.io", "Alex Kim", "ATHLETE");
        seedClassesAndProgramming(demo, coach.getId());
        seedScoresAndLifts(demo, athlete.getId(), athlete2.getId(), athlete3.getId());
        seedAnnouncement(demo, coach.getId());
    }

    private User seed(Box box, String email, String name, String role) {
        User u = authService.register(email, "password123", name);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return u;
    }

    /** Class types with skeletons + a weekly schedule; today's instances get published programming. */
    private void seedClassesAndProgramming(Box box, UUID coachId) {
        runAsBox(box.getId(), () -> {
            // class types (every weekday so a fresh box always has a class today)
            for (int weekday = 0; weekday <= 4; weekday++) {
                template("WOD Class", weekday, LocalTime.of(18, 0), 14, coachId);
                template("Burn It", weekday, LocalTime.of(19, 0), 12, coachId);
            }
            template("Weekend Team WOD", 5, LocalTime.of(10, 0), 20, coachId);

            // skeletons per type name
            for (ClassTemplate t : templates.findByActiveTrue()) {
                if (!skeletons.findByTemplateIdOrderBySortOrderAsc(t.getId()).isEmpty()) continue;
                if ("Burn It".equals(t.getName())) {
                    skeleton(t.getId(), 0, "Warm-up", "WARMUP");
                    skeleton(t.getId(), 1, "Engine circuit", "CIRCUIT");
                    skeleton(t.getId(), 2, "Burner", "AMRAP");
                } else {
                    skeleton(t.getId(), 0, "Warm-up", "WARMUP");
                    skeleton(t.getId(), 1, "Strength", "STRENGTH");
                    skeleton(t.getId(), 2, "Metcon", "FOR_TIME");
                }
            }
        });
        sessionGenerator.generateForBox(box.getId());

        // publish modular programming on today's instances
        runAsBox(box.getId(), () -> {
            UUID warmup = wod("Row + mobility", "WARMUP", "NONE", "5' easy row, hip openers, empty-bar work");
            UUID strength = wod("Back Squat 5x5", "STRENGTH", "LOAD", "Back Squat 5x5 @ 80% — log your top set");
            UUID fran = wods.findByTitleContainingIgnoreCaseOrderByUpdatedAtDesc("Fran").stream().findFirst()
                    .map(Wod::getId).orElseGet(() -> wod("Fran", "FOR_TIME", "TIME", "21-15-9: Thrusters (95/65), Pull-Ups"));
            UUID burner = wod("10' burner", "AMRAP", "ROUNDS_REPS", "AMRAP 10: 8 cal row, 8 burpees, 8 wall balls");

            var zone = java.time.ZoneId.of(box.getTimezone());
            var from = java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant();
            var to = java.time.LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant();
            for (ClassSession s : sessions.findByStartAtBetweenOrderByStartAt(from, to)) {
                if ("Burn It".equals(s.getName())) {
                    item(s.getId(), 0, warmup, false, null);
                    item(s.getId(), 1, burner, true, null);
                } else {
                    item(s.getId(), 0, warmup, false, null);
                    item(s.getId(), 1, strength, true, null);
                    item(s.getId(), 2, fran, true, null);
                }
                s.setProgrammingStatus("PUBLISHED");
                sessions.save(s);
            }
        });
    }

    private void seedScoresAndLifts(Box box, UUID athlete, UUID athlete2, UUID athlete3) {
        runAsBox(box.getId(), () -> {
            UUID mA = membershipId(athlete, box.getId());
            UUID mB = membershipId(athlete2, box.getId());
            UUID mC = membershipId(athlete3, box.getId());

            // scores on today's first TIME-scored item
            items.findAll().stream()
                    .filter(SessionItem::isScoreable)
                    .filter(i -> wods.findById(i.getWodId()).map(w -> "FOR_TIME".equals(w.getWodType())).orElse(false))
                    .findFirst().ifPresent(i -> {
                        score(i.getId(), mA, true, 183, false);
                        score(i.getId(), mB, true, 201, false);
                        score(i.getId(), mC, false, 240, true); // scaled + private
                    });

            movements.findVisible(box.getId()).stream()
                    .filter(m -> "Back Squat".equals(m.getName())).findFirst()
                    .ifPresent(bs -> {
                        java.time.LocalDate d0 = java.time.LocalDate.now().minusWeeks(6);
                        lift(mA, bs.getId(), "100.0", d0, false);
                        lift(mA, bs.getId(), "110.0", d0.plusWeeks(2), true);
                        lift(mA, bs.getId(), "115.0", d0.plusWeeks(4), true);
                        lift(mA, bs.getId(), "120.0", d0.plusWeeks(6), true);
                    });
        });
    }

    private void seedAnnouncement(Box box, UUID coachUserId) {
        runAsBox(box.getId(), () -> {
            Announcement a = new Announcement();
            a.setBody("Saturday: Team WOD at 10:00 — bring a friend! The box closes early at 20:00 this Friday.");
            a.setUpdatedBy(coachUserId);
            announcements.save(a);
        });
    }

    private void template(String name, int weekday, LocalTime start, int capacity, UUID coachId) {
        ClassTemplate t = new ClassTemplate();
        t.setName(name);
        t.setWeekday(weekday);
        t.setStartTime(start);
        t.setDurationMin(60);
        t.setCapacity(capacity);
        t.setCoachId(coachId);
        templates.save(t);
    }

    private void skeleton(UUID templateId, int sort, String label, String type) {
        TemplatePiece p = new TemplatePiece();
        p.setTemplateId(templateId);
        p.setSortOrder(sort);
        p.setLabel(label);
        p.setWodType(type);
        skeletons.save(p);
    }

    private UUID wod(String title, String type, String scoreType, String body) {
        Wod w = new Wod();
        w.setTitle(title);
        w.setWodType(type);
        w.setScoreType(scoreType);
        w.setBodyText(body);
        return wods.save(w).getId();
    }

    private void item(UUID sessionId, int sort, UUID wodId, boolean scoreable, String scoreType) {
        SessionItem i = new SessionItem();
        i.setSessionId(sessionId);
        i.setSortOrder(sort);
        i.setWodId(wodId);
        i.setScoreable(scoreable);
        i.setScoreType(scoreType);
        items.save(i);
    }

    private UUID membershipId(UUID userId, UUID boxId) {
        return memberships.findByUserIdAndBoxId(userId, boxId).orElseThrow().getId();
    }

    private void score(UUID itemId, UUID membershipId, boolean rx, Integer timeSeconds, boolean priv) {
        WodScore s = new WodScore();
        s.setSessionItemId(itemId);
        s.setMembershipId(membershipId);
        s.setRx(rx);
        s.setTimeSeconds(timeSeconds);
        s.setFinished(true);
        s.setPrivate(priv);
        wodScores.save(s);
    }

    private void lift(UUID membershipId, UUID movementId, String load, java.time.LocalDate on, boolean pr) {
        LiftEntry l = new LiftEntry();
        l.setMembershipId(membershipId);
        l.setMovementId(movementId);
        l.setLoad(new java.math.BigDecimal(load));
        l.setReps(1);
        l.setPerformedOn(on);
        l.setPr(pr);
        liftEntries.save(l);
    }

    private void runAsBox(UUID boxId, Runnable r) {
        Jwt jwt = Jwt.withTokenValue("seed").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
        try { r.run(); } finally { SecurityContextHolder.clearContext(); }
    }
}
