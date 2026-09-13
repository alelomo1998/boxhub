package com.boxhub.programming;

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

    private final WodRepository wods;
    private final BenchmarkTemplateRepository benchmarks;
    private final SessionItemRepository sessionItems;
    private final ObjectMapper om;

    public WodService(WodRepository wods, BenchmarkTemplateRepository benchmarks,
                      SessionItemRepository sessionItems, ObjectMapper om) {
        this.wods = wods;
        this.benchmarks = benchmarks;
        this.sessionItems = sessionItems;
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
        BenchmarkTemplate t = benchmarks.findById(templateId).orElseThrow(NoSuchElementException::new);
        Wod w = new Wod();
        w.setTitle(t.getName());
        w.setMacro(WodTypeWire.toMacro("CUSTOM"));
        w.setTimingPreset(WodTypeWire.toTimingPreset("CUSTOM"));
        w.setScoreType(t.getScoreType());
        w.setTimeCapSeconds(t.getTimeCapSeconds());
        w.setBodyText(t.getBodyText());
        w.setBlocksJson(t.getBlocksJson());
        w.setBenchmarkTemplateId(t.getId());
        w.setLibrary(library);
        w.setCreatedBy(TenantContext.userId());
        return wods.save(w);
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
