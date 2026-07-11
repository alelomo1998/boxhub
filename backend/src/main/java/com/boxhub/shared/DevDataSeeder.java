package com.boxhub.shared;

import com.boxhub.box.Announcement;
import com.boxhub.box.AnnouncementRepository;
import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
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

    @org.springframework.beans.factory.annotation.Value("${boxhub.media-dir}")
    private String mediaDir;

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
    private final BookingRepository bookings;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService,
                         ClassTemplateRepository templates, ClassSessionRepository sessions,
                         SessionGenerator sessionGenerator, TemplatePieceRepository skeletons,
                         SessionItemRepository items, WodRepository wods, MovementRepository movements,
                         WodScoreRepository wodScores, LiftEntryRepository liftEntries,
                         AnnouncementRepository announcements, BookingRepository bookings) {
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
        this.bookings = bookings;
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
        User coach2 = seed(demo, "coach2@demo.io", "Jordan Blake", "COACH");
        User athlete = seed(demo, "athlete@demo.io", "Demo Athlete", "ATHLETE");
        User athlete2 = seed(demo, "athlete2@demo.io", "Sam Rivera", "ATHLETE");
        User athlete3 = seed(demo, "athlete3@demo.io", "Alex Kim", "ATHLETE");
        User athlete4 = seed(demo, "athlete4@demo.io", "Maria Silva", "ATHLETE");
        User athlete5 = seed(demo, "athlete5@demo.io", "Tom Baker", "ATHLETE");
        User athlete6 = seed(demo, "athlete6@demo.io", "Nina Petrova", "ATHLETE");
        User athlete7 = seed(demo, "athlete7@demo.io", "Leo Rossi", "ATHLETE");
        User athlete8 = seed(demo, "athlete8@demo.io", "Ana Costa", "ATHLETE");
        List<User> athletes = List.of(athlete, athlete2, athlete3, athlete4, athlete5, athlete6, athlete7, athlete8);

        seedClassesAndProgramming(demo, coach.getId(), coach2.getId());
        seedScoresAndLifts(demo, athlete.getId(), athlete2.getId(), athlete3.getId());
        seedBookings(demo, athletes);
        seedAnnouncement(demo, coach.getId());

        List<UUID> photoUserIds = new java.util.ArrayList<>();
        photoUserIds.add(coach.getId());
        photoUserIds.add(coach2.getId());
        for (User a : athletes) photoUserIds.add(a.getId());
        seedImages(demo, photoUserIds.toArray(UUID[]::new));
    }

    /** Generated placeholder images so photo-driven screens render on a fresh box. */
    private void seedImages(Box box, UUID... userIds) {
        runAsBox(box.getId(), () -> {
            java.util.Map<String, java.awt.Color> classColors = java.util.Map.of(
                    "WOD Class", new java.awt.Color(0x8a2f1a),
                    "Burn It", new java.awt.Color(0x1a5a52),
                    "Weekend Team WOD", new java.awt.Color(0x3a2f6b));
            for (ClassTemplate t : templates.findByActiveTrue()) {
                if (t.getImagePath() != null) continue;
                java.awt.Color c = classColors.getOrDefault(t.getName(), new java.awt.Color(0x444444));
                String path = writePng(box.getId(), 640, 360, c, "cl-" + t.getId());
                if (path != null) { t.setImagePath(path); templates.save(t); }
            }
            java.awt.Color[] avatarColors = { new java.awt.Color(0xB0562F), new java.awt.Color(0x2F6BB0),
                    new java.awt.Color(0x5A8A3C), new java.awt.Color(0x8A3C7A) };
            int idx = 0;
            for (UUID uid : userIds) {
                var m = memberships.findByUserIdAndBoxId(uid, box.getId()).orElse(null);
                if (m == null || m.getAvatarPath() != null) continue;
                String path = writePng(box.getId(), 200, 200, avatarColors[idx++ % avatarColors.length], "av-" + uid);
                if (path != null) { m.setAvatarPath(path); memberships.save(m); }
            }
        });
    }

    private String writePng(UUID boxId, int w, int h, java.awt.Color color, String name) {
        try {
            java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(w, h, java.awt.image.BufferedImage.TYPE_INT_RGB);
            var g = img.createGraphics();
            g.setColor(color);
            g.fillRect(0, 0, w, h);
            g.setColor(color.brighter());
            g.fillOval(w / 4, h / 4, w / 2, h / 2);
            g.dispose();
            java.nio.file.Path dir = java.nio.file.Path.of(mediaDir).resolve(boxId.toString());
            java.nio.file.Files.createDirectories(dir);
            java.nio.file.Path file = dir.resolve(name + ".png");
            javax.imageio.ImageIO.write(img, "png", file.toFile());
            return "/media/" + boxId + "/" + name + ".png";
        } catch (Exception e) {
            return null; // dev seeding only — never fail startup over a placeholder image
        }
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
    private void seedClassesAndProgramming(Box box, UUID coachId, UUID coach2Id) {
        runAsBox(box.getId(), () -> {
            // every day (incl. weekends) so a fresh box always has a WOD Class + Burn It today
            for (int weekday = 0; weekday <= 6; weekday++) {
                template("WOD Class", weekday, LocalTime.of(18, 0), 14, coachId);
                template("Burn It", weekday, LocalTime.of(19, 0), 12, coach2Id);
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

        // clock-relative "today" instances: the fixed 18:00/19:00 slots may already be past by the
        // time the box seeds (or not yet generated for tonight) — these guarantee today always has
        // one class in progress (checkin demo) and one still bookable, regardless of seed time.
        runAsBox(box.getId(), () -> {
            todaySession("WOD Class", Instant.now().minus(java.time.Duration.ofMinutes(20)), 60, 14, coachId);
            todaySession("Burn It", Instant.now().plus(java.time.Duration.ofMinutes(40)), 60, 12, coach2Id);
        });

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

    /** Books athletes onto the coming week's sessions so schedule/roster/check-in screens have real rosters. */
    private void seedBookings(Box box, List<User> athletes) {
        runAsBox(box.getId(), () -> {
            List<UUID> mids = athletes.stream().map(a -> membershipId(a.getId(), box.getId())).toList();
            var zone = java.time.ZoneId.of(box.getTimezone());
            // from start-of-today, not now: the synthetic in-progress "today" session starts in the
            // past (see todaySession) and still needs a roster for the check-in demo.
            var from = java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant();
            var to = java.time.LocalDate.now(zone).plusDays(8).atStartOfDay(zone).toInstant();
            List<ClassSession> upcoming = sessions.findByStartAtBetweenOrderByStartAt(from, to);

            int offset = 0;
            for (ClassSession s : upcoming) {
                int count = "Weekend Team WOD".equals(s.getName()) ? 7 : 3 + (offset % 3); // 3-5 regular, 7 team WOD
                for (int k = 0; k < count && k < mids.size(); k++) {
                    booking(s.getId(), mids.get((offset + k) % mids.size()), "BOOKED", null);
                }
                offset++;
            }

            // classes already underway read as mid-session: a couple checked in, one no-show
            var todayEnd = java.time.LocalDate.now(zone).plusDays(1).atStartOfDay(zone).toInstant();
            for (ClassSession s : sessions.findByStartAtBetweenOrderByStartAt(from, todayEnd)) {
                if (s.getStartAt().isAfter(Instant.now())) continue; // hasn't started — nobody's checked in yet
                List<Booking> roster = bookings.findBySessionId(s.getId());
                for (int i = 0; i < roster.size(); i++) {
                    Booking b = roster.get(i);
                    if (i == 0) { b.setStatus("CHECKED_IN"); b.setCheckedInAt(Instant.now()); bookings.save(b); }
                    else if (i == 1 && roster.size() > 3) { b.setStatus("NO_SHOW"); bookings.save(b); }
                }
            }
        });
    }

    private void booking(UUID sessionId, UUID membershipId, String status, Integer position) {
        if (bookings.findBySessionIdAndMembershipId(sessionId, membershipId).isPresent()) return;
        Booking b = new Booking();
        b.setSessionId(sessionId);
        b.setMembershipId(membershipId);
        b.setStatus(status);
        b.setPosition(position);
        bookings.save(b);
    }

    private void seedAnnouncement(Box box, UUID coachUserId) {
        runAsBox(box.getId(), () -> {
            Announcement a = new Announcement();
            a.setBody("Saturday: Team WOD at 10:00 — bring a friend! The box closes early at 20:00 this Friday.");
            a.setUpdatedBy(coachUserId);
            announcements.save(a);
        });
    }

    private void todaySession(String name, Instant startAt, int durationMin, int capacity, UUID coachId) {
        ClassSession s = new ClassSession();
        s.setName(name);
        s.setStartAt(startAt);
        s.setDurationMin(durationMin);
        s.setCapacity(capacity);
        s.setCoachId(coachId);
        sessions.save(s);
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
