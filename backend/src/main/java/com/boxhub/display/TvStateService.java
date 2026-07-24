package com.boxhub.display;

import com.boxhub.box.*;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.performance.Leaderboard;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
import com.boxhub.programming.*;
import com.boxhub.shared.MediaSigner;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

/**
 * Composes the full TV snapshot for a box. MUST be called with the box tenant already
 * established (runAsBox) — it reads @TenantId entities, and a tenant-less read fails
 * open to root (ADR-001), which would leak other boxes' data onto the TV.
 */
@Service
public class TvStateService {

    public record TvState(String view, String boxName, NextClass next, SessionInfo session,
                          List<ItemInfo> items, List<RailRow> rail, TimerInfo timer) {}
    public record NextClass(String name, Instant startAt) {}
    public record SessionInfo(UUID id, String name, Instant startAt, int durationMin,
                              String coachName, String coachAvatarPath) {}
    public record ItemInfo(String type, String title, String bodyText) {}
    public record RailRow(String name, String avatarPath, String status,
                          Integer rank, String score, Boolean rx) {}
    public record TimerInfo(String type, Integer totalSeconds, Integer rounds, Integer workSeconds,
                            Integer restSeconds, Long startAtEpoch, long pausedElapsedMs, String status,
                            String pieceTitle, String pieceBody) {}

    private static final com.fasterxml.jackson.databind.ObjectMapper TIMER_MAPPER = new com.fasterxml.jackson.databind.ObjectMapper();

    private static final Duration GRACE = Duration.ofMinutes(30);

    private final BoxRepository boxes;
    private final ClassSessionRepository sessions;
    private final SessionItemRepository items;
    private final WodRepository wods;
    private final BookingRepository bookings;
    private final MembershipRepository memberships;
    private final WodScoreRepository scores;
    private final ClassTimerRepository timers;
    private final MediaSigner mediaSigner;

    public TvStateService(BoxRepository boxes, ClassSessionRepository sessions, SessionItemRepository items,
                          WodRepository wods, BookingRepository bookings, MembershipRepository memberships,
                          WodScoreRepository scores, ClassTimerRepository timers, MediaSigner mediaSigner) {
        this.boxes = boxes; this.sessions = sessions; this.items = items;
        this.wods = wods; this.bookings = bookings; this.memberships = memberships; this.scores = scores;
        this.timers = timers; this.mediaSigner = mediaSigner;
    }

    @Transactional(readOnly = true)
    public TvState compose(UUID boxId) {
        Box box = boxes.findById(boxId).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        Instant now = Instant.now();
        Instant weekOut = now.plus(Duration.ofDays(7));

        List<ClassSession> upcoming = sessions.findByStartAtBetweenOrderByStartAt(
                        now.minus(Duration.ofHours(3)), weekOut).stream()
                .filter(s -> !"CANCELLED".equals(s.getStatus()))
                .toList();

        // current = started and inside duration+grace; else next starting today
        Instant endOfToday = LocalDate.now(tz).plusDays(1).atStartOfDay(tz).toInstant();
        ClassSession current = upcoming.stream()
                .filter(s -> !s.getStartAt().isAfter(now)
                        && s.getStartAt().plus(Duration.ofMinutes(s.getDurationMin())).plus(GRACE).isAfter(now))
                .reduce((a, b) -> b).orElse(null); // latest started one
        if (current == null) {
            current = upcoming.stream()
                    .filter(s -> s.getStartAt().isAfter(now) && s.getStartAt().isBefore(endOfToday))
                    .findFirst().orElse(null);
        }

        if (current == null) {
            NextClass next = upcoming.stream().filter(s -> s.getStartAt().isAfter(now)).findFirst()
                    .map(s -> new NextClass(s.getName(), s.getStartAt())).orElse(null);
            return new TvState("IDLE", box.getName(), next, null, List.of(), List.of(), null);
        }

        Membership coach = null; // coachId on session is a USER id; resolve membership for avatar+name
        if (current.getCoachId() != null)
            coach = memberships.findByUserIdAndBoxId(current.getCoachId(), boxId).orElse(null);

        // draft programming is never broadcast: no items, no ranked rows (scores can't exist on drafts anyway)
        List<ItemInfo> itemInfos = new ArrayList<>();
        Map<UUID, RailRow> ranked = new LinkedHashMap<>(); // membershipId -> row
        if ("PUBLISHED".equals(current.getProgrammingStatus())) {
            List<SessionItem> sessionItems = items.findBySessionIdOrderBySortOrderAsc(current.getId());
            Map<UUID, Wod> wodById = new HashMap<>();
            for (SessionItem it : sessionItems) {
                Wod w = wods.findById(it.getWodId()).orElse(null);
                if (w == null) continue;
                wodById.put(it.getId(), w);
                itemInfos.add(new ItemInfo(w.getWodType(), w.getTitle(), w.getBodyText()));
            }

            // rail: ranked results from the LAST scoreable item's leaderboard, merged with the roster
            SessionItem scored = sessionItems.stream()
                    .filter(SessionItem::isScoreable)
                    .reduce((a, b) -> b).orElse(null); // the metcon is conventionally last
            if (scored != null) {
                Wod w = wodById.get(scored.getId());
                String scoreType = SessionItemController.effectiveScoreType(scored, w);
                List<WodScore> rankedScores = Leaderboard.rank(scores.findBySessionItemId(scored.getId()), scoreType);
                int r = 1;
                for (WodScore sc : rankedScores) {
                    Membership m = memberships.findById(sc.getMembershipId()).orElse(null);
                    if (m == null) continue;
                    ranked.put(m.getId(), new RailRow(m.getUser().getName(), mediaSigner.sign(m.getAvatarPath()),
                            "SCORED", r++, format(scoreType, sc), sc.isRx()));
                }
            }
        }

        List<RailRow> rail = new ArrayList<>(ranked.values());
        for (Booking b : bookings.findBySessionId(current.getId())) {
            boolean inClass = "BOOKED".equals(b.getStatus()) || "CHECKED_IN".equals(b.getStatus());
            if (!inClass || ranked.containsKey(b.getMembershipId())) continue;
            Membership m = memberships.findById(b.getMembershipId()).orElse(null);
            if (m == null) continue;
            rail.add(new RailRow(m.getUser().getName(), mediaSigner.sign(m.getAvatarPath()), b.getStatus(), null, null, null));
        }

        TimerInfo timer = composeTimer(current.getId());

        return new TvState("CLASS", box.getName(), null,
                new SessionInfo(current.getId(), current.getName(), current.getStartAt(), current.getDurationMin(),
                        coach == null ? null : coach.getUser().getName(),
                        coach == null ? null : mediaSigner.sign(coach.getAvatarPath())),
                itemInfos, rail, timer);
    }

    private TimerInfo composeTimer(UUID sessionId) {
        ClassTimer t = timers.findBySessionId(sessionId).orElse(null);
        if (t == null || !("RUNNING".equals(t.getStatus()) || "PAUSED".equals(t.getStatus()))) return null;
        String pieceTitle = null, pieceBody = null;
        if (t.getSessionItemId() != null) {
            SessionItem si = items.findById(t.getSessionItemId()).orElse(null);
            if (si != null) {
                Wod w = wods.findById(si.getWodId()).orElse(null);
                if (w != null) { pieceTitle = w.getTitle(); pieceBody = w.getBodyText(); }
            }
        }
        try {
            com.fasterxml.jackson.databind.JsonNode spec = TIMER_MAPPER.readTree(t.getSpecJson());
            return new TimerInfo(
                    spec.path("type").asText(null),
                    spec.has("totalSeconds") ? spec.get("totalSeconds").asInt() : null,
                    spec.has("rounds") ? spec.get("rounds").asInt() : null,
                    spec.has("workSeconds") ? spec.get("workSeconds").asInt() : null,
                    spec.has("restSeconds") ? spec.get("restSeconds").asInt() : null,
                    t.getStartedAtEpoch(), t.getPausedElapsedMs(), t.getStatus(), pieceTitle, pieceBody);
        } catch (Exception e) { return null; } // malformed spec never breaks the board
    }

    static String format(String scoreType, WodScore s) {
        return switch (scoreType) {
            case "TIME" -> s.isFinished() && s.getTimeSeconds() != null
                    ? "%d:%02d".formatted(s.getTimeSeconds() / 60, s.getTimeSeconds() % 60)
                    : (s.getReps() == null ? "0" : s.getReps()) + " reps";
            case "ROUNDS_REPS" -> (s.getRounds() == null ? 0 : s.getRounds()) + "+" + (s.getReps() == null ? 0 : s.getReps());
            case "LOAD" -> s.getLoad() == null ? "0" : s.getLoad().stripTrailingZeros().toPlainString();
            default -> "Done";
        };
    }
}
