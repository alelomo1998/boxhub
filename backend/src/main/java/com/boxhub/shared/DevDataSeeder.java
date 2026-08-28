package com.boxhub.shared;

import com.boxhub.box.AnnouncementService;
import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.box.ClassType;
import com.boxhub.box.ClassTypeRepository;
import com.boxhub.box.ScheduleSlot;
import com.boxhub.box.ScheduleSlotRepository;
import com.boxhub.box.Plan;
import com.boxhub.box.PlanRepository;
import com.boxhub.box.SessionGenerator;
import com.boxhub.box.Subscription;
import com.boxhub.box.SubscriptionRepository;
import com.boxhub.box.SubscriptionService;
import com.boxhub.identity.*;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
import com.boxhub.programming.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
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
    private final ClassTypeRepository types;
    private final ScheduleSlotRepository slots;
    private final ClassSessionRepository sessions;
    private final SessionGenerator sessionGenerator;
    private final TemplatePieceRepository skeletons;
    private final SessionItemRepository items;
    private final WodRepository wods;
    private final MovementRepository movements;
    private final WodScoreRepository wodScores;
    private final LiftEntryRepository liftEntries;
    private final AnnouncementService announcements;
    private final BookingRepository bookings;
    private final UserRepository userRepo;
    private final PlanRepository plans;
    private final SubscriptionRepository subscriptions;
    private final SubscriptionService subscriptionService;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService,
                         ClassTypeRepository types, ScheduleSlotRepository slots, ClassSessionRepository sessions,
                         SessionGenerator sessionGenerator, TemplatePieceRepository skeletons,
                         SessionItemRepository items, WodRepository wods, MovementRepository movements,
                         WodScoreRepository wodScores, LiftEntryRepository liftEntries,
                         AnnouncementService announcements, BookingRepository bookings, UserRepository userRepo,
                         PlanRepository plans, SubscriptionRepository subscriptions, SubscriptionService subscriptionService) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.authService = authService;
        this.types = types;
        this.slots = slots;
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
        this.userRepo = userRepo;
        this.plans = plans;
        this.subscriptions = subscriptions;
        this.subscriptionService = subscriptionService;
    }

    @Override
    public void run(String... args) {
        seedSuperadmin();
        if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;
        Box demo = new Box();
        demo.setName("Demo Box");
        demo.setSlug("demo");
        demo.setTimezone("Europe/Rome");
        boxes.save(demo);
        User admin = seed(demo, "admin@demo.io", "Demo Admin", "BOX_ADMIN");
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

        // M23 fixtures. The app has three account shapes and only one of them was seeded:
        // every demo user held exactly one membership, so login() auto-selected and no test
        // could reach the hub, and no test could switch gyms. These two close that.
        Box northside = new Box();
        northside.setName("Northside Barbell");
        northside.setSlug("northside");
        northside.setTimezone("Europe/Rome");
        boxes.save(northside);

        // Holds TWO gyms with DIFFERENT roles, which is the case M21 made real and the case a
        // switcher has to get right: switching must land on the target gym's role home, not the
        // one you came from.
        User multi = seed(demo, "multi@demo.io", "Multi Box", "ATHLETE");
        Membership northsideAdmin = new Membership();
        northsideAdmin.setUser(multi);
        northsideAdmin.setBox(northside);
        northsideAdmin.setRole("BOX_ADMIN");
        memberships.save(northsideAdmin);

        // Registered, verified, and belonging to NO gym — the state every account starts in,
        // and the one that had no shell at all before M23.
        User nobox = authService.register("nobox@demo.io", "boxhub-demo-2026", "No Box");
        nobox.setEmailVerified(true);
        userRepo.save(nobox);

        // M23 multi-gym fixtures, part 2. Nearly every demo account still held exactly one
        // membership, so the hub and the switcher were only ever exercised with two-gym data.
        // Three more boxes, in the three statuses the hub has to render, plus three accounts
        // that hit the corners multi@demo.io and nobox@demo.io don't reach.
        Box southside = new Box();
        southside.setName("Southside Strength");
        southside.setSlug("southside");
        southside.setTimezone("Europe/Rome");
        boxes.save(southside);

        Box harbour = new Box();
        harbour.setName("Harbour CrossFit");
        harbour.setSlug("harbour");
        harbour.setTimezone("Europe/Rome");
        harbour.setStatus("PENDING");
        boxes.save(harbour);

        Box oldmill = new Box();
        oldmill.setName("Old Mill Athletics");
        oldmill.setSlug("oldmill");
        oldmill.setTimezone("Europe/Rome");
        oldmill.setStatus("SUSPENDED");
        boxes.save(oldmill);

        // Three gyms, three different roles — the case where switching must land on the TARGET
        // gym's role home, not the one you came from (multi@demo.io only ever proves two gyms).
        User triple = seed(demo, "triple@demo.io", "Tria Nolan", "ATHLETE");
        Membership tripleNorthsideCoach = new Membership();
        tripleNorthsideCoach.setUser(triple);
        tripleNorthsideCoach.setBox(northside);
        tripleNorthsideCoach.setRole("COACH");
        memberships.save(tripleNorthsideCoach);
        Membership tripleSouthsideAdmin = new Membership();
        tripleSouthsideAdmin.setUser(triple);
        tripleSouthsideAdmin.setBox(southside);
        tripleSouthsideAdmin.setRole("BOX_ADMIN");
        memberships.save(tripleSouthsideAdmin);

        // Same two-gym shape as multi@demo.io, roles inverted — coach at home, athlete away.
        User duo = seed(demo, "duo@demo.io", "Dio Marsh", "COACH");
        Membership duoNorthsideAthlete = new Membership();
        duoNorthsideAthlete.setUser(duo);
        duoNorthsideAthlete.setBox(northside);
        duoNorthsideAthlete.setRole("ATHLETE");
        memberships.save(duoNorthsideAthlete);

        // Both unreachable-gym states in one account: BOX_ADMIN of a PENDING gym ("In review")
        // and ATHLETE of a SUSPENDED gym ("Unavailable"), next to one reachable membership.
        User blocked = seed(demo, "blocked@demo.io", "Billie Okafor", "ATHLETE");
        Membership blockedHarbourAdmin = new Membership();
        blockedHarbourAdmin.setUser(blocked);
        blockedHarbourAdmin.setBox(harbour);
        blockedHarbourAdmin.setRole("BOX_ADMIN");
        memberships.save(blockedHarbourAdmin);
        Membership blockedOldmillAthlete = new Membership();
        blockedOldmillAthlete.setUser(blocked);
        blockedOldmillAthlete.setBox(oldmill);
        blockedOldmillAthlete.setRole("ATHLETE");
        memberships.save(blockedOldmillAthlete);

        List<User> athletes = List.of(athlete, athlete2, athlete3, athlete4, athlete5, athlete6, athlete7, athlete8);

        seedClassesAndProgramming(demo, coach.getId(), coach2.getId());
        seedScoresAndLifts(demo, athlete.getId(), athlete2.getId(), athlete3.getId());
        seedPlansAndSubscriptions(demo, List.of(admin, coach, coach2), athletes);
        seedBookings(demo, athletes);
        seedAnnouncement(demo, coach.getId());

        List<UUID> photoUserIds = new java.util.ArrayList<>();
        photoUserIds.add(coach.getId());
        photoUserIds.add(coach2.getId());
        for (User a : athletes) photoUserIds.add(a.getId());
        seedImages(demo, photoUserIds.toArray(UUID[]::new));
    }

    /** Superadmin has no box membership — matches boxhub.superadmin-emails in docker-compose.yml. */
    private void seedSuperadmin() {
        if (userRepo.findByEmail("super@demo.io").isPresent()) return;
        User su = authService.register("super@demo.io", "boxhub-demo-2026", "Super Admin");
        su.setEmailVerified(true);
        userRepo.save(su);
    }

    /** Generated placeholder images so photo-driven screens render on a fresh box. */
    private void seedImages(Box box, UUID... userIds) {
        TenantContext.runAsBox(box.getId(), () -> {
            java.util.Map<String, java.awt.Color> classColors = java.util.Map.of(
                    "WOD Class", new java.awt.Color(0x8a2f1a),
                    "Burn It", new java.awt.Color(0x1a5a52),
                    "Weekend Team WOD", new java.awt.Color(0x3a2f6b));
            for (ClassType t : types.findAll()) {
                if (t.getImagePath() != null) continue;
                java.awt.Color c = classColors.getOrDefault(t.getName(), new java.awt.Color(0x444444));
                String path = writePng(box.getId(), 640, 360, c, "cl-" + t.getId());
                if (path != null) { t.setImagePath(path); types.save(t); }
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
        User u = authService.register(email, "boxhub-demo-2026", name);
        u.setEmailVerified(true); // demo logins must work without clicking a verify link
        userRepo.save(u);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return u;
    }

    /** Class types with skeletons + a weekly schedule; today's instances get published programming. */
    private void seedClassesAndProgramming(Box box, UUID coachId, UUID coach2Id) {
        TenantContext.runAsBox(box.getId(), () -> {
            // one class type per name, with one slot per weekday it runs — a class that ran twice
            // a week used to be two template rows; it is now one type with two slots.
            UUID wodClassType = classType("WOD Class");
            UUID burnItType = classType("Burn It");
            UUID teamWodType = classType("Weekend Team WOD");

            // every day (incl. weekends) so a fresh box always has a WOD Class + Burn It today
            for (int weekday = 0; weekday <= 6; weekday++) {
                slot(wodClassType, weekday, LocalTime.of(18, 0), 14, coachId);
                slot(burnItType, weekday, LocalTime.of(19, 0), 12, coach2Id);
            }
            slot(teamWodType, 5, LocalTime.of(10, 0), 20, coachId);

            // skeletons per class type
            for (ClassType t : types.findAll()) {
                if (!skeletons.findByClassTypeIdOrderBySortOrderAsc(t.getId()).isEmpty()) continue;
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
        TenantContext.runAsBox(box.getId(), () -> {
            todaySession("WOD Class", Instant.now().minus(java.time.Duration.ofMinutes(20)), 60, 14, coachId);
            todaySession("Burn It", Instant.now().plus(java.time.Duration.ofMinutes(40)), 60, 12, coach2Id);
        });

        // publish modular programming on today's instances
        TenantContext.runAsBox(box.getId(), () -> {
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
        TenantContext.runAsBox(box.getId(), () -> {
            UUID mA = membershipId(athlete, box.getId());
            UUID mB = membershipId(athlete2, box.getId());
            UUID mC = membershipId(athlete3, box.getId());

            // scores on today's first TIME-scored item
            items.findAll().stream()
                    .filter(SessionItem::isScoreable)
                    .filter(i -> wods.findById(i.getWodId()).map(w -> "FOR_TIME".equals(w.getTimingPreset())).orElse(false))
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

    /**
     * M10: priced plans + a mix of ACTIVE subscriptions so every seeded PERSON can actually book
     * (BookingService.entitlementBlocked 409s NO_ACTIVE_SUBSCRIPTION otherwise) — not just athletes:
     * the e902bd9 fix covered the 8 athletes but left admin/coaches unable to book the demo classes
     * they're seeded into. Mix mirrors a real roster: mostly the unlimited plan at list price, some
     * negotiated discount (priceNote), some on the weekly-limit plan, and the LAST roster member
     * grandfathered (null currentPeriodEnd, still ACTIVE per SubscriptionService.activeFor) — cycled
     * by index rather than hard-indexed athletes.get(7), so a trimmed roster can't throw at startup.
     */
    private void seedPlansAndSubscriptions(Box box, List<User> staff, List<User> athletes) {
        TenantContext.runAsBox(box.getId(), () -> {
            Plan unlimited = plan("Unlimited Monthly", 30, null, 8900, "eur");
            Plan weekly = plan("3x Weekly", 30, 3, 5900, "eur");

            List<User> roster = new java.util.ArrayList<>(staff);
            roster.addAll(athletes);
            if (roster.isEmpty()) return;

            // everyone but the last roster member cycles through the list/weekly/discount mix
            for (int i = 0; i < roster.size() - 1; i++) {
                UUID membershipId = membershipId(roster.get(i).getId(), box.getId());
                switch (i % 4) {
                    case 2 -> subscriptionService.recordPeriod(membershipId, weekly.getId(), weekly.getPriceCents(), null);
                    case 3 -> subscriptionService.recordPeriod(membershipId, unlimited.getId(), 7000, "Founding member rate");
                    default -> subscriptionService.recordPeriod(membershipId, unlimited.getId(), unlimited.getPriceCents(), null);
                }
            }

            // grandfathered: ACTIVE with no period end (predates M10 pricing) — hand-rolled since
            // recordPeriod always sets a currentPeriodEnd from the plan's duration. Always the LAST
            // roster member, so it never collides with the loop above (one ACTIVE sub per membership).
            UUID lastMembershipId = membershipId(roster.get(roster.size() - 1).getId(), box.getId());
            Subscription grandfathered = new Subscription();
            grandfathered.setMembershipId(lastMembershipId);
            grandfathered.setPlanId(unlimited.getId());
            grandfathered.setStatus("ACTIVE");
            grandfathered.setPriceCents(unlimited.getPriceCents());
            grandfathered.setPriceNote("Grandfathered — legacy pricing");
            grandfathered.setCurrentPeriodEnd(null);
            subscriptions.save(grandfathered);
        });
    }

    private Plan plan(String name, int durationDays, Integer entriesPerWeek, int priceCents, String currency) {
        Plan p = new Plan();
        p.setName(name);
        p.setDurationDays(durationDays);
        p.setEntriesPerWeek(entriesPerWeek);
        p.setPriceCents(priceCents);
        p.setCurrency(currency);
        return plans.save(p);
    }

    /** Books athletes onto the coming week's sessions so schedule/roster/check-in screens have real rosters. */
    private void seedBookings(Box box, List<User> athletes) {
        TenantContext.runAsBox(box.getId(), () -> {
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
        if (bookings.findBySessionIdAndMembershipIdAndStatusNot(sessionId, membershipId, "CANCELLED").isPresent()) return;
        Booking b = new Booking();
        b.setSessionId(sessionId);
        b.setMembershipId(membershipId);
        b.setStatus(status);
        b.setPosition(position);
        bookings.save(b);
    }

    private void seedAnnouncement(Box box, UUID coachUserId) {
        // Routed through the real send path so it fans out to announcement_recipient — Step 1
        // re-sources the athlete home card through recipient rows, so a hand-built row here (no
        // fan-out) would leave a freshly seeded demo box showing no announcement at all.
        TenantContext.runAsBox(box.getId(), () ->
                announcements.send(
                        "Saturday: Team WOD at 10:00 — bring a friend! The box closes early at 20:00 this Friday.",
                        "EVERYONE", null));
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

    private UUID classType(String name) {
        ClassType t = new ClassType();
        t.setName(name);
        return types.save(t).getId();
    }

    private void slot(UUID classTypeId, int weekday, LocalTime start, int capacity, UUID coachId) {
        ScheduleSlot s = new ScheduleSlot();
        s.setClassTypeId(classTypeId);
        s.setWeekday(weekday);
        s.setStartTime(start);
        s.setDurationMin(60);
        s.setCapacity(capacity);
        s.setCoachId(coachId);
        slots.save(s);
    }

    private void skeleton(UUID classTypeId, int sort, String label, String type) {
        TemplatePiece p = new TemplatePiece();
        p.setClassTypeId(classTypeId);
        p.setSortOrder(sort);
        p.setLabel(label);
        p.setMacro(WodTypeWire.toMacro(type));
        p.setTimingPreset(WodTypeWire.toTimingPreset(type));
        skeletons.save(p);
    }

    private UUID wod(String title, String type, String scoreType, String body) {
        Wod w = new Wod();
        w.setTitle(title);
        w.setMacro(WodTypeWire.toMacro(type));
        w.setTimingPreset(WodTypeWire.toTimingPreset(type));
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
        // score_type is NOT NULL (M14a): null here still means "auto", mirroring
        // SessionItemController.replace()'s write-time derivation from the wod's own score type.
        i.setScoreType(scoreType != null ? scoreType : wods.findById(wodId).orElseThrow().getScoreType());
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
}
