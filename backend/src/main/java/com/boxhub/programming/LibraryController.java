package com.boxhub.programming;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * The merged Library: the box's own saved pieces (default) or the 18 global benchmarks with the
 * box's own copies swapped in (benchmarks=true) -- one read endpoint feeding the Library page and
 * the class stack's benchmark picker (spec §8, D13-D22).
 */
@RestController
@RequestMapping("/api/box/library")
public class LibraryController {

    private static final int PAGE_SIZE = 50;

    private final WodRepository wods;
    private final BenchmarkTemplateRepository benchmarks;
    private final WodService service;
    private final BoxRepository boxes;

    public LibraryController(WodRepository wods, BenchmarkTemplateRepository benchmarks,
                             WodService service, BoxRepository boxes) {
        this.wods = wods;
        this.benchmarks = benchmarks;
        this.service = service;
        this.boxes = boxes;
    }

    public record Row(WodController.WodDto wod, String benchmarkKind, boolean global) {}
    public record LibraryPage(List<Row> rows, String nextCursor, long total) {}

    @GetMapping
    public LibraryPage library(@RequestParam(required = false) String q,
                               @RequestParam(required = false) String macro,
                               @RequestParam(required = false) String timing,
                               @RequestParam(required = false) List<UUID> movement,
                               @RequestParam(required = false, defaultValue = "false") boolean benchmarks,
                               @RequestParam(required = false) List<String> kind,
                               @RequestParam(required = false) String cursor) {
        RoleGuard.requireStaff();
        List<UUID> movements = movement == null ? List.of() : movement;
        return benchmarks ? benchmarkMode(q, macro, timing, movements, kind)
                          : libraryMode(q, macro, timing, movements, cursor);
    }

    private LibraryPage libraryMode(String q, String macro, String timing, List<UUID> movements, String cursor) {
        Specification<Wod> spec = libraryFilter(q, macro, timing, movements);
        Specification<Wod> cursorSpec = decodeCursor(cursor);
        Specification<Wod> paged = cursorSpec == null ? spec : spec.and(cursorSpec);

        List<Wod> found = wods.findBy(paged, fq -> fq
                .sortBy(Sort.by(Sort.Direction.DESC, "updatedAt").and(Sort.by(Sort.Direction.DESC, "id")))
                .limit(PAGE_SIZE + 1)
                .all());

        boolean hasMore = found.size() > PAGE_SIZE;
        List<Wod> page = hasMore ? found.subList(0, PAGE_SIZE) : found;
        String next = hasMore ? encodeCursor(page.get(page.size() - 1)) : null;
        long total = wods.count(spec);

        List<Row> rows = page.stream().map(w -> new Row(service.toDto(w), null, false)).toList();
        return new LibraryPage(rows, next, total);
    }

    /** No real pagination here -- 18 templates, ever. */
    private LibraryPage benchmarkMode(String q, String macro, String timing, List<UUID> movements, List<String> kind) {
        if (macro != null && !macro.isBlank() && !"WORKOUT".equals(macro))
            return new LibraryPage(List.of(), null, 0);

        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        String weightUnit = box.getWeightUnit();

        List<BenchmarkTemplate> templates = benchmarks.findAllByOrderByKindAscNameAsc();
        String needle = (q != null && q.trim().length() >= 3) ? q.trim().toLowerCase(Locale.ROOT) : null;

        Map<UUID, Wod> copied = wods.findByLibraryTrueAndBenchmarkTemplateIdIsNotNull().stream()
                // A benchmark added to the library twice is two rows: show the most recently edited.
                .collect(Collectors.toMap(Wod::getBenchmarkTemplateId, w -> w,
                        (a, b) -> a.getUpdatedAt().isAfter(b.getUpdatedAt()) ? a : b));

        List<Row> rows = new ArrayList<>();
        for (BenchmarkTemplate t : templates) {
            if (kind != null && !kind.isEmpty() && !kind.contains(t.getKind())) continue;
            if (needle != null && !t.getName().toLowerCase(Locale.ROOT).contains(needle)) continue;
            if (!movements.isEmpty() && !matchesMovement(t, movements)) continue;
            if (timing != null && !timing.isBlank()
                    && !timing.equals(WodService.derivedTimingPreset(t.getScoreType()))) continue;

            Wod copy = copied.get(t.getId());
            rows.add(copy != null
                    ? new Row(service.toDto(copy), t.getKind(), false)
                    : new Row(service.benchmarkDto(t, weightUnit), t.getKind(), true));
        }
        return new LibraryPage(rows, null, rows.size());
    }

    /** jsonb's text form is normalised ("key": "value"), so a movement id matches as a substring
     *  anywhere in the tree -- nested blocks included. Same pattern the JPA predicate below uses. */
    private static boolean matchesMovement(BenchmarkTemplate t, List<UUID> movements) {
        return movements.stream().anyMatch(m -> t.getBlocksJson().contains("\"movementId\": \"" + m + "\""));
    }

    static Specification<Wod> libraryFilter(String q, String macro, String timing, List<UUID> movements) {
        return (root, cq, cb) -> {
            List<Predicate> p = new ArrayList<>();
            p.add(cb.isTrue(root.get("library")));
            if (q != null && q.trim().length() >= 3)
                p.add(cb.like(cb.lower(root.get("title")), "%" + q.trim().toLowerCase(Locale.ROOT) + "%"));
            if (macro != null && !macro.isBlank()) p.add(cb.equal(root.get("macro"), macro));
            if (timing != null && !timing.isBlank()) p.add(cb.equal(root.get("timingPreset"), timing));
            if (movements != null && !movements.isEmpty()) {
                // jsonb's text form is normalised ("key": "value"), so a movement id matches as a
                // substring anywhere in the tree -- nested blocks and scaling options included.
                // JpaExpression.cast, not Expression.as: .as() only retypes the Java side and emits
                // no SQL cast, so Postgres saw jsonb LIKE text. Still Criteria, so the @TenantId
                // filter on Wod applies -- native SQL would bypass it.
                // ponytail: substring match on jsonb text; a jsonb_path_exists predicate if the
                // library ever needs an index on it.
                jakarta.persistence.criteria.Expression<String> json =
                        ((org.hibernate.query.criteria.JpaExpression<?>) root.get("blocksJson")).cast(String.class);
                p.add(cb.or(movements.stream()
                        .map(m -> cb.like(json, "%\"movementId\": \"" + m + "\"%")).toArray(Predicate[]::new)));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
    }

    private static String encodeCursor(Wod w) { return w.getUpdatedAt() + "|" + w.getId(); }

    /** A malformed cursor is rejected with 400 -- unlike the notification feed's cursor, which
     *  falls back to page one, the library's paging contract (R3) requires the client to know it
     *  sent a bad one rather than silently seeing page one again. */
    private static Specification<Wod> decodeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        int split = cursor.indexOf('|');
        if (split <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Malformed cursor");
        Instant updatedAt;
        UUID id;
        try {
            updatedAt = Instant.parse(cursor.substring(0, split));
            id = UUID.fromString(cursor.substring(split + 1));
        } catch (RuntimeException malformed) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Malformed cursor");
        }
        Instant cursorUpdatedAt = updatedAt;
        UUID cursorId = id;
        return (root, cq, cb) -> cb.or(
                cb.lessThan(root.get("updatedAt"), cursorUpdatedAt),
                cb.and(cb.equal(root.get("updatedAt"), cursorUpdatedAt), cb.lessThan(root.get("id"), cursorId)));
    }
}
