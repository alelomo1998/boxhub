package com.boxhub.shared;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassTemplate;
import com.boxhub.box.ClassTemplateRepository;
import com.boxhub.box.SessionGenerator;
import com.boxhub.identity.*;
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
    private final SessionGenerator sessionGenerator;
    private final com.boxhub.programming.TrackService trackService;
    private final com.boxhub.programming.TrackRepository tracks;
    private final com.boxhub.programming.WodRepository wods;
    private final com.boxhub.programming.ProgramSlotRepository slots;
    private final com.boxhub.programming.MovementRepository movements;
    private final com.boxhub.performance.WodScoreRepository wodScores;
    private final com.boxhub.performance.LiftEntryRepository liftEntries;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService,
                         ClassTemplateRepository templates, SessionGenerator sessionGenerator,
                         com.boxhub.programming.TrackService trackService,
                         com.boxhub.programming.TrackRepository tracks,
                         com.boxhub.programming.WodRepository wods,
                         com.boxhub.programming.ProgramSlotRepository slots,
                         com.boxhub.programming.MovementRepository movements,
                         com.boxhub.performance.WodScoreRepository wodScores,
                         com.boxhub.performance.LiftEntryRepository liftEntries) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.authService = authService;
        this.templates = templates;
        this.sessionGenerator = sessionGenerator;
        this.trackService = trackService;
        this.tracks = tracks;
        this.wods = wods;
        this.slots = slots;
        this.movements = movements;
        this.wodScores = wodScores;
        this.liftEntries = liftEntries;
    }

    @Override
    public void run(String... args) {
        if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;
        Box demo = new Box();
        demo.setName("Demo Box");
        demo.setSlug("demo");
        demo.setTimezone("Europe/Rome");
        boxes.save(demo);
        trackService.seedDefaults(demo.getId()); // RX + Fitness
        seed(demo, "admin@demo.io", "Demo Admin", "BOX_ADMIN");
        User coach = seed(demo, "coach@demo.io", "Demo Coach", "COACH");
        User athlete = seed(demo, "athlete@demo.io", "Demo Athlete", "ATHLETE");
        User athlete2 = seed(demo, "athlete2@demo.io", "Sam Rivera", "ATHLETE");
        User athlete3 = seed(demo, "athlete3@demo.io", "Alex Kim", "ATHLETE");
        seedSchedule(demo, coach.getId());
        seedProgramming(demo);
        seedScoresAndLifts(demo, athlete.getId(), athlete2.getId(), athlete3.getId());
    }

    /** Scores on the published week + a lift history so leaderboards/PRs/charts render on a fresh box. */
    private void seedScoresAndLifts(Box box, UUID athlete, UUID athlete2, UUID athlete3) {
        runAsBox(box.getId(), () -> {
            UUID mA = membershipId(athlete, box.getId());
            UUID mB = membershipId(athlete2, box.getId());
            UUID mC = membershipId(athlete3, box.getId());

            // score the earliest TIME-scored published slot (RX Fran on Monday) for three athletes
            slots.findAll().stream()
                    .filter(s -> "PUBLISHED".equals(s.getStatus()))
                    .filter(s -> wods.findById(s.getWodId()).map(w -> "TIME".equals(w.getScoreType())).orElse(false))
                    .min(java.util.Comparator.comparing(com.boxhub.programming.ProgramSlot::getSlotDate))
                    .ifPresent(slot -> {
                        score(slot.getId(), mA, true, 183, true, false);
                        score(slot.getId(), mB, true, 201, true, false);
                        score(slot.getId(), mC, false, 240, true, true); // scaled + private
                    });

            // lift history for the demo athlete on Back Squat: ascending -> PR on the last
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

    private UUID membershipId(UUID userId, UUID boxId) {
        return memberships.findByUserIdAndBoxId(userId, boxId).orElseThrow().getId();
    }

    private void score(UUID slotId, UUID membershipId, boolean rx, Integer timeSeconds, boolean finished, boolean priv) {
        com.boxhub.performance.WodScore s = new com.boxhub.performance.WodScore();
        s.setSlotId(slotId);
        s.setMembershipId(membershipId);
        s.setRx(rx);
        s.setTimeSeconds(timeSeconds);
        s.setFinished(finished);
        s.setPrivate(priv);
        wodScores.save(s);
    }

    private void lift(UUID membershipId, UUID movementId, String load, java.time.LocalDate on, boolean pr) {
        com.boxhub.performance.LiftEntry l = new com.boxhub.performance.LiftEntry();
        l.setMembershipId(membershipId);
        l.setMovementId(movementId);
        l.setLoad(new java.math.BigDecimal(load));
        l.setReps(1);
        l.setPerformedOn(on);
        l.setPr(pr);
        liftEntries.save(l);
    }

    /** A published sample week on both tracks so a fresh demo box has a WOD board. */
    private void seedProgramming(Box box) {
        runAsBox(box.getId(), () -> {
            var trackList = tracks.findByArchivedFalseOrderBySortOrderAsc();
            if (trackList.isEmpty()) return;
            UUID rx = trackList.get(0).getId();
            UUID fitness = trackList.size() > 1 ? trackList.get(1).getId() : rx;
            java.time.LocalDate monday = java.time.LocalDate.now().with(java.time.DayOfWeek.MONDAY);
            String[][] week = {
                    {"Fran", "FOR_TIME", "TIME", "21-15-9: Thrusters (95/65), Pull-Ups"},
                    {"Cindy", "AMRAP", "ROUNDS_REPS", "AMRAP 20: 5 Pull-Ups, 10 Push-Ups, 15 Air Squats"},
                    {"Back Squat 5x5", "STRENGTH", "LOAD", "Back Squat 5x5 @ 80%"},
                    {"Helen", "FOR_TIME", "TIME", "3 RFT: 400m Run, 21 KB Swings, 12 Pull-Ups"},
                    {"Grace", "FOR_TIME", "TIME", "30 Clean and Jerks (135/95) for time"},
            };
            for (int i = 0; i < week.length; i++) {
                java.time.LocalDate d = monday.plusDays(i);
                UUID wodId = wod(week[i]);
                publishSlot(d, rx, wodId);
                publishSlot(d, fitness, wod(new String[]{week[i][0] + " (scaled)", week[i][1], week[i][2], week[i][3]}));
            }
        });
    }

    private UUID wod(String[] spec) {
        com.boxhub.programming.Wod w = new com.boxhub.programming.Wod();
        w.setTitle(spec[0]);
        w.setWodType(spec[1]);
        w.setScoreType(spec[2]);
        w.setBodyText(spec[3]);
        return wods.save(w).getId();
    }

    private void publishSlot(java.time.LocalDate date, UUID trackId, UUID wodId) {
        com.boxhub.programming.ProgramSlot s = new com.boxhub.programming.ProgramSlot();
        s.setSlotDate(date);
        s.setTrackId(trackId);
        s.setWodId(wodId);
        s.setStatus("PUBLISHED");
        s.setPublishedAt(java.time.Instant.now());
        slots.save(s);
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

    /** A small realistic weekly schedule so a fresh demo box isn't empty. */
    private void seedSchedule(Box box, UUID coachId) {
        runAsBox(box.getId(), () -> {
            template("Morning WOD", 0, LocalTime.of(6, 30), 12, coachId);   // Mon
            template("Evening WOD", 2, LocalTime.of(18, 30), 14, coachId);  // Wed
            template("Evening WOD", 4, LocalTime.of(18, 30), 14, coachId);  // Fri
            template("Weekend Team WOD", 5, LocalTime.of(10, 0), 20, coachId); // Sat
        });
        sessionGenerator.generateForBox(box.getId());
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
