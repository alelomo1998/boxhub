package com.boxhub.performance;

import com.boxhub.box.Booking;
import com.boxhub.box.BookingRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.box.PtBooking;
import com.boxhub.box.PtBookingRepository;
import com.boxhub.programming.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/** Read-model helpers shared by history, profile and home endpoints. */
@Service
public class PerformanceQueries {

    private final WodScoreRepository scores;
    private final SessionItemRepository items;
    private final ClassSessionRepository sessions;
    private final WodRepository wods;
    private final BenchmarkTemplateRepository benchmarks;
    private final LiftEntryRepository lifts;
    private final MovementRepository movements;
    private final BookingRepository bookings;
    private final PtBookingRepository ptBookings;
    private final PostRepository posts;
    private final PostLikeRepository postLikes;
    private final WodRatingRepository wodRatings;

    public PerformanceQueries(WodScoreRepository scores, SessionItemRepository items,
                              ClassSessionRepository sessions, WodRepository wods,
                              BenchmarkTemplateRepository benchmarks, LiftEntryRepository lifts,
                              MovementRepository movements, BookingRepository bookings,
                              PtBookingRepository ptBookings, PostRepository posts,
                              PostLikeRepository postLikes, WodRatingRepository wodRatings) {
        this.scores = scores;
        this.items = items;
        this.sessions = sessions;
        this.wods = wods;
        this.benchmarks = benchmarks;
        this.lifts = lifts;
        this.movements = movements;
        this.bookings = bookings;
        this.ptBookings = ptBookings;
        this.posts = posts;
        this.postLikes = postLikes;
        this.wodRatings = wodRatings;
    }

    public record BenchmarkBest(String benchmarkName, String scoreType, Integer timeSeconds, Integer rounds,
                                Integer reps, java.math.BigDecimal load, LocalDate achievedOn) {}
    public record LiftPr(UUID movementId, String movementName, java.math.BigDecimal load, int reps,
                         LocalDate performedOn) {}

    public List<BenchmarkBest> benchmarkHistory(UUID membershipId) {
        List<WodScore> mine = scores.findByMembershipIdOrderByCreatedAtDesc(membershipId);
        Map<UUID, SessionItem> itemById = items.findAll().stream()
                .collect(Collectors.toMap(SessionItem::getId, i -> i, (a, b) -> a));
        Map<UUID, ClassSession> sessionById = sessions.findAll().stream()
                .collect(Collectors.toMap(ClassSession::getId, s -> s, (a, b) -> a));
        Map<UUID, Wod> wodById = wods.findAll().stream().collect(Collectors.toMap(Wod::getId, w -> w, (a, b) -> a));
        Map<UUID, String> benchmarkNames = benchmarks.findAll().stream()
                .collect(Collectors.toMap(BenchmarkTemplate::getId, BenchmarkTemplate::getName, (a, b) -> a));

        Map<UUID, List<WodScore>> byBenchmark = new java.util.HashMap<>();
        Map<UUID, String> scoreTypeByBenchmark = new java.util.HashMap<>();
        for (WodScore s : mine) {
            SessionItem i = itemById.get(s.getSessionItemId());
            Wod w = i == null ? null : wodById.get(i.getWodId());
            if (i == null || w == null || w.getBenchmarkTemplateId() == null) continue;
            byBenchmark.computeIfAbsent(w.getBenchmarkTemplateId(), k -> new ArrayList<>()).add(s);
            scoreTypeByBenchmark.put(w.getBenchmarkTemplateId(), i.getScoreType()); // explicit now (M14a)
        }

        List<BenchmarkBest> out = new ArrayList<>();
        for (var e : byBenchmark.entrySet()) {
            String scoreType = scoreTypeByBenchmark.get(e.getKey());
            WodScore b = Leaderboard.best(e.getValue(), scoreType);
            if (b == null) continue;
            SessionItem i = itemById.get(b.getSessionItemId());
            ClassSession cs = i == null ? null : sessionById.get(i.getSessionId());
            out.add(new BenchmarkBest(benchmarkNames.getOrDefault(e.getKey(), "—"), scoreType,
                    b.getTimeSeconds(), b.getRounds(), b.getReps(), b.getLoad(),
                    cs == null || cs.getStartAt() == null ? null
                            : cs.getStartAt().atZone(ZoneId.systemDefault()).toLocalDate()));
        }
        out.sort(Comparator.comparing(BenchmarkBest::benchmarkName, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    public List<LiftPr> liftPrs(UUID membershipId, UUID boxId) {
        Map<UUID, String> names = movements.findVisible(boxId).stream()
                .collect(Collectors.toMap(Movement::getId, Movement::getName, (a, b) -> a));
        Map<UUID, LiftEntry> best = lifts.findByMembershipIdOrderByPerformedOnDesc(membershipId).stream()
                .collect(Collectors.toMap(LiftEntry::getMovementId, l -> l,
                        (a, b) -> a.getLoad().compareTo(b.getLoad()) >= 0 ? a : b));
        return best.values().stream()
                .sorted(Comparator.comparing((LiftEntry l) -> names.getOrDefault(l.getMovementId(), "")))
                .map(l -> new LiftPr(l.getMovementId(), names.getOrDefault(l.getMovementId(), "—"),
                        l.getLoad(), l.getReps(), l.getPerformedOn()))
                .toList();
    }

    /** Distinct ISO weeks with at least one score or lift in the last 8 weeks. */
    public int streakWeeks(UUID membershipId) {
        Instant cutoff = Instant.now().minusSeconds(8L * 7 * 86400);
        var weeks = new java.util.HashSet<String>();
        scores.findByMembershipIdOrderByCreatedAtDesc(membershipId).stream()
                .filter(s -> s.getCreatedAt().isAfter(cutoff))
                .forEach(s -> weeks.add(isoWeek(s.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate())));
        lifts.findByMembershipIdOrderByPerformedOnDesc(membershipId).stream()
                .filter(l -> l.getPerformedOn().isAfter(LocalDate.now().minusWeeks(8)))
                .forEach(l -> weeks.add(isoWeek(l.getPerformedOn())));
        return weeks.size();
    }

    private static String isoWeek(LocalDate d) {
        var wf = java.time.temporal.WeekFields.ISO;
        return d.get(wf.weekBasedYear()) + "-" + d.get(wf.weekOfWeekBasedYear());
    }

    // --- GDPR export: raw dumps across every membership the user ever held, no scoring math ---
    // These three use the NATIVE ...ForExport finders, not the derived ones the rest of this class
    // uses: GET /api/me/export runs on a boxless session, where a derived read of a @TenantId
    // entity resolves NO_TENANT and returns empty. docs/TENANCY.md §6.

    public List<Map<String, Object>> bookingsOf(List<UUID> membershipIds) {
        return membershipIds.stream()
                .flatMap(id -> bookings.findByMembershipIdForExport(id).stream())
                .map(PerformanceQueries::bookingDump)
                .toList();
    }

    public List<Map<String, Object>> scoresOf(List<UUID> membershipIds) {
        return membershipIds.stream()
                .flatMap(id -> scores.findByMembershipIdForExport(id).stream())
                .map(PerformanceQueries::scoreDump)
                .toList();
    }

    public List<Map<String, Object>> liftsOf(List<UUID> membershipIds) {
        return membershipIds.stream()
                .flatMap(id -> lifts.findByMembershipIdForExport(id).stream())
                .map(PerformanceQueries::liftDump)
                .toList();
    }

    // --- GDPR export additions (M22): coach-side PT bookings, visitor bookings, social rows ---
    // Same boxless-export reasoning as bookings/scores/lifts above: PtBooking, Booking (visitor
    // path) and the three social entities are all @TenantId, so GET /api/me/export's boxless
    // session needs the native ...ForExport finder, never the derived sibling. docs/TENANCY.md §6.

    public List<Map<String, Object>> ptBookingsAsCoachOf(List<UUID> coachMembershipIds) {
        return coachMembershipIds.stream()
                .flatMap(id -> ptBookings.findByCoachMembershipIdForExport(id).stream())
                .map(PerformanceQueries::ptBookingDump)
                .toList();
    }

    public List<Map<String, Object>> ptBookingsAsAthleteOf(UUID athleteUserId) {
        return ptBookings.findByAthleteUserIdForExport(athleteUserId).stream()
                .map(PerformanceQueries::ptBookingDump)
                .toList();
    }

    public List<Map<String, Object>> visitorBookingsOf(UUID visitorUserId) {
        return bookings.findByVisitorUserIdForExport(visitorUserId).stream()
                .map(PerformanceQueries::bookingDump)
                .toList();
    }

    public List<Map<String, Object>> postsOf(List<UUID> membershipIds) {
        return membershipIds.stream()
                .flatMap(id -> posts.findByAuthorMembershipIdForExport(id).stream())
                .map(PerformanceQueries::postDump)
                .toList();
    }

    public List<Map<String, Object>> likesOf(UUID userId) {
        return postLikes.findByUserIdForExport(userId).stream()
                .map(PerformanceQueries::postLikeDump)
                .toList();
    }

    public List<Map<String, Object>> ratingsOf(UUID userId) {
        return wodRatings.findByUserIdForExport(userId).stream()
                .map(PerformanceQueries::wodRatingDump)
                .toList();
    }

    private static Map<String, Object> ptBookingDump(PtBooking b) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("coachMembershipId", b.getCoachMembershipId());
        m.put("athleteUserId", b.getAthleteUserId());
        m.put("startsAt", b.getStartsAt());
        m.put("durationMin", b.getDurationMin());
        m.put("status", b.getStatus());
        m.put("priceCents", b.getPriceCents());
        m.put("currency", b.getCurrency());
        return m;
    }

    private static Map<String, Object> postDump(Post p) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("wodId", p.getWodId());
        m.put("caption", p.getCaption());
        m.put("visibility", p.getVisibility());
        m.put("createdAt", p.getCreatedAt());
        return m;
    }

    private static Map<String, Object> postLikeDump(PostLike l) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("postId", l.getPostId());
        m.put("createdAt", l.getCreatedAt());
        return m;
    }

    private static Map<String, Object> wodRatingDump(WodRating r) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("wodId", r.getWodId());
        m.put("rating", r.getRating());
        m.put("createdAt", r.getCreatedAt());
        return m;
    }

    private static Map<String, Object> bookingDump(Booking b) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("sessionId", b.getSessionId());
        m.put("status", b.getStatus());
        m.put("bookedAt", b.getBookedAt());
        return m;
    }

    private static Map<String, Object> scoreDump(WodScore s) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("rx", s.isRx());
        m.put("timeSeconds", s.getTimeSeconds());
        m.put("rounds", s.getRounds());
        m.put("reps", s.getReps());
        m.put("load", s.getLoad());
        m.put("createdAt", s.getCreatedAt());
        return m;
    }

    private static Map<String, Object> liftDump(LiftEntry l) {
        Map<String, Object> m = new java.util.HashMap<>();
        m.put("movementId", l.getMovementId());
        m.put("load", l.getLoad());
        m.put("reps", l.getReps());
        m.put("performedOn", l.getPerformedOn());
        return m;
    }
}
