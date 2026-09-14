package com.boxhub.programming;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.shared.TenantContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class WodService {

    private static final double KG_PER_LB = 0.45359237;

    private final WodRepository wods;
    private final BenchmarkTemplateRepository benchmarks;
    private final SessionItemRepository sessionItems;
    private final BoxRepository boxes;
    private final ObjectMapper om;

    public WodService(WodRepository wods, BenchmarkTemplateRepository benchmarks,
                      SessionItemRepository sessionItems, BoxRepository boxes, ObjectMapper om) {
        this.wods = wods;
        this.benchmarks = benchmarks;
        this.sessionItems = sessionItems;
        this.boxes = boxes;
        this.om = om;
    }

    String serialize(WodJson.Blocks blocks) {
        WodJson.Blocks b = blocks == null ? WodJson.Blocks.empty() : blocks;
        WodJsonValidator.validateBlocks(b);
        try {
            return om.writeValueAsString(b);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid blocks");
        }
    }

    WodJson.Blocks deserialize(String json) {
        try {
            return normaliseScales(om.readValue(json, WodJson.Blocks.class));
        } catch (JsonProcessingException e) {
            return WodJson.Blocks.empty();
        }
    }

    /**
     * Reads always speak one meaning: a line's legacy free-text `scaling` becomes a one-entry
     * `scales` list and `scaling` clears. No migration -- blocks_json is JSONB and a historical row
     * heals itself the next time it is saved (spec 5A.2). Records are immutable, so this rebuilds
     * the tree rather than mutating it, walking both levels of block nesting.
     */
    private WodJson.Blocks normaliseScales(WodJson.Blocks blocks) {
        if (blocks == null || blocks.blocks() == null) return blocks;
        return new WodJson.Blocks(blocks.blocks().stream().map(this::normaliseBlock).toList());
    }

    private WodJson.Block normaliseBlock(WodJson.Block b) {
        List<WodJson.Block> children = b.blocks() == null ? null
                : b.blocks().stream().map(this::normaliseBlock).toList();
        return new WodJson.Block(b.label(), b.note(), normaliseLines(b.lines()), children);
    }

    private List<WodJson.Line> normaliseLines(List<WodJson.Line> lines) {
        if (lines == null) return null;
        return lines.stream().map(this::normaliseLine).toList();
    }

    private WodJson.Line normaliseLine(WodJson.Line l) {
        List<WodJson.Scale> scales = l.scales();
        if ((scales == null || scales.isEmpty()) && l.scaling() != null && !l.scaling().isBlank()) {
            scales = List.of(new WodJson.Scale(l.scaling(), null, null, null, null));
        }
        return new WodJson.Line(l.text(), l.movementId(), l.reps(), l.load(), null, scales, l.unit());
    }

    String serializeTiming(WodJson.Timing timing) {
        WodJson.Timing t = timing == null ? WodJson.Timing.empty() : timing;
        WodJsonValidator.validateTiming(t);
        try {
            return om.writeValueAsString(t);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timing");
        }
    }

    WodJson.Timing deserializeTiming(String json) {
        try {
            return om.readValue(json, WodJson.Timing.class);
        } catch (JsonProcessingException e) {
            return WodJson.Timing.empty();
        }
    }

    public WodController.WodDto toDto(Wod w) {
        return new WodController.WodDto(
                w.getId(), w.getTitle(),
                WodTypeWire.toWodType(w.getMacro(), w.getTimingPreset()),
                w.getMacro(), w.getTimingPreset(), deserializeTiming(w.getTimingJson()),
                w.isLibrary(), w.getTeamSize(), w.getTeamShare(),
                w.getScoreType(), w.getTimeCapSeconds(), w.getBodyText(),
                deserialize(w.getBlocksJson()), w.getScalingNotes(), w.getBenchmarkTemplateId());
    }

    /** Map a global benchmark template to a box WOD, keeping provenance. The ONE template-to-wod
     *  mapper: the clone endpoint makes a library row (library = true), a class pick makes the
     *  class's own copy (library = false). */
    Wod cloneFromBenchmark(java.util.UUID templateId, boolean library) {
        Wod w = benchmarkWod(templateId, library);
        w.setCreatedBy(TenantContext.userId());
        return wods.save(w);
    }

    /** The mapping itself, unsaved and without an author: a request stamps its user
     *  (cloneFromBenchmark), the dev seeder stamps its coach, because runAsBox's synthetic
     *  subject is not a users(id) row and wod.created_by references one. */
    public Wod benchmarkWod(java.util.UUID templateId, boolean library) {
        BenchmarkTemplate t = benchmarks.findById(templateId).orElseThrow(NoSuchElementException::new);
        Box box = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        Wod w = new Wod();
        w.setTitle(t.getName());
        w.setMacro(WodTypeWire.toMacro("CUSTOM"));
        w.setTimingPreset(switch (t.getScoreType()) {
            case "TIME" -> "FOR_TIME";
            case "ROUNDS_REPS" -> "AMRAP";
            default -> null;
        });
        w.setScoreType(t.getScoreType());
        w.setTimeCapSeconds(t.getTimeCapSeconds());
        w.setBodyText(t.getBodyText());
        w.setBlocksJson(benchmarkBlocks(t, box.getWeightUnit()));
        w.setBenchmarkTemplateId(t.getId());
        w.setLibrary(library);
        return w;
    }

    /** A template's blocks with each line's load (stored in lb, the benchmark's source unit) in
     *  the box's unit. Only numeric loads convert; D22 keeps the women's load in the note. */
    String benchmarkBlocks(BenchmarkTemplate t, String weightUnit) {
        if (!"KG".equals(weightUnit)) return t.getBlocksJson();
        WodJson.Blocks blocks = deserialize(t.getBlocksJson());
        return serialize(new WodJson.Blocks(blocks.blocks().stream().map(this::toKg).toList()));
    }

    private WodJson.Block toKg(WodJson.Block b) {
        List<WodJson.Line> lines = b.lines() == null ? null
                : b.lines().stream().map(this::lineToKg).toList();
        List<WodJson.Block> children = b.blocks() == null ? null
                : b.blocks().stream().map(this::toKg).toList();
        return new WodJson.Block(b.label(), b.note(), lines, children);
    }

    private WodJson.Line lineToKg(WodJson.Line l) {
        String load = l.load();
        if (load == null) return l;
        try {
            load = String.valueOf(Math.round(Double.parseDouble(load) * KG_PER_LB));
        } catch (NumberFormatException e) {
            return l; // non-numeric load (e.g. "95/65") -- leave as-is, unreachable via the benchmark seed
        }
        return new WodJson.Line(l.text(), l.movementId(), l.reps(), load, l.scaling(), l.scales(), l.unit());
    }

    Instant now() { return Instant.now(); }

    /**
     * Attaching a library WOD to a class COPIES it: the class owns its content, so editing the
     * library entry later never rewrites what a class that already ran actually did (spec decision 3).
     * The copy is library = false. This is also the root-cause fix for the unbounded-growth bug —
     * subsequent edits update the copy in place instead of inserting new library rows.
     */
    @Transactional
    public SessionItem attachToSession(UUID libraryWodId, UUID sessionId, int sortOrder) {
        Wod source = wods.findById(libraryWodId).orElseThrow();
        Wod copy = copyForSession(source);

        SessionItem item = new SessionItem();
        item.setSessionId(sessionId);
        item.setWodId(copy.getId());
        item.setSortOrder(sortOrder);
        item.setScoreType(copy.getScoreType());
        return sessionItems.save(item);
    }

    /**
     * The copy half of attachToSession, reusable by the replace-items path, which owns item
     * creation itself. ONE copier, so a field added to Wod cannot be copied by one path and
     * forgotten by the other. source_wod_id is the link "save to library" later updates in place.
     */
    @Transactional
    public Wod copyForSession(Wod source) {
        Wod copy = new Wod();
        copy.setTitle(source.getTitle());
        copy.setMacro(source.getMacro());
        copy.setTimingPreset(source.getTimingPreset());
        copy.setTimingJson(source.getTimingJson());
        copy.setScoreType(source.getScoreType());
        copy.setTimeCapSeconds(source.getTimeCapSeconds());
        copy.setBodyText(source.getBodyText());
        copy.setBlocksJson(source.getBlocksJson());
        copy.setScalingNotes(source.getScalingNotes());
        copy.setTeamSize(source.getTeamSize());
        copy.setTeamShare(source.getTeamShare());
        copy.setBenchmarkTemplateId(source.getBenchmarkTemplateId());
        copy.setLibrary(false);
        copy.setSourceWodId(source.getId());
        return wods.save(copy);
    }

    /**
     * "Save this piece to the library", default OFF in the UI (tour decision 4). When the piece
     * came from a library entry, that entry is UPDATED IN PLACE -- which is what decision 4 means
     * by re-saving. Otherwise one library row is created and linked, so the NEXT save takes the
     * update branch instead of adding a second row. This replaces promoteToLibrary, which flipped
     * the class's own copy into the library and re-coupled the class to the shared row, undoing
     * copy-on-attach.
     */
    @Transactional
    public Wod saveToLibrary(UUID wodId) {
        Wod piece = wods.findById(wodId).orElseThrow();
        UUID sourceId = piece.getSourceWodId();
        Wod target = sourceId != null ? wods.findById(sourceId).orElse(null) : null;
        if (target == null) {
            target = new Wod();
            target.setCreatedBy(TenantContext.userId());
        }
        target.setTitle(piece.getTitle());
        target.setMacro(piece.getMacro());
        target.setTimingPreset(piece.getTimingPreset());
        target.setTimingJson(piece.getTimingJson());
        target.setScoreType(piece.getScoreType());
        target.setTimeCapSeconds(piece.getTimeCapSeconds());
        target.setBodyText(piece.getBodyText());
        target.setBlocksJson(piece.getBlocksJson());
        target.setScalingNotes(piece.getScalingNotes());
        target.setTeamSize(piece.getTeamSize());
        target.setTeamShare(piece.getTeamShare());
        target.setBenchmarkTemplateId(piece.getBenchmarkTemplateId());
        target.setLibrary(true);
        target.setUpdatedAt(now());
        Wod saved = wods.save(target);

        piece.setSourceWodId(saved.getId());
        wods.save(piece);
        return saved;
    }
}
