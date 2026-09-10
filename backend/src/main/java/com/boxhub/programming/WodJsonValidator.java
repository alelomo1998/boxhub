package com.boxhub.programming;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Blocks nest exactly two levels and segments are well-formed. This is the price of spec decision 8:
 * the depth cap lives here rather than in the type system, so that no blocks_json value had to be
 * rewritten by the migration. An untested validator is not a guarantee — see WodJsonValidatorTest.
 */
public final class WodJsonValidator {
    private WodJsonValidator() {}

    private static final int MAX_SCALES_PER_LINE = 6;

    public static void validateBlocks(WodJson.Blocks blocks) {
        if (blocks == null || blocks.blocks() == null) return;
        for (WodJson.Block b : blocks.blocks()) {
            validateLines(b.lines());
            List<WodJson.Block> children = b.blocks();
            if (children == null) continue;
            for (WodJson.Block child : children) {
                if (child.blocks() != null && !child.blocks().isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "BLOCK_DEPTH: blocks nest at most two levels");
                }
                validateLines(child.lines());
            }
        }
    }

    private static void validateLines(List<WodJson.Line> lines) {
        if (lines == null) return;
        for (WodJson.Line l : lines) {
            // ponytail: not cross-checked against the movement's own allowed units -- this validator
            // is a pure function with no movement repository, and staying that way is the point.
            // The editor is what keeps the line's unit and the movement's allowed list in step.
            if (l.unit() != null && !Movement.UNITS.contains(l.unit()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "LINE_UNIT: unknown unit");
            List<WodJson.Scale> scales = l.scales();
            if (scales == null) continue;
            // blocks_json is an unbounded user-controlled document, and this milestone is closing
            // an unbounded-growth bug rather than opening a second one.
            if (scales.size() > MAX_SCALES_PER_LINE)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "SCALE_COUNT: at most " + MAX_SCALES_PER_LINE + " scaling options per line");
            for (WodJson.Scale sc : scales) {
                boolean blankText = sc.text() == null || sc.text().isBlank();
                if (blankText && sc.movementId() == null)
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "SCALE_EMPTY: a scaling option needs a movement or some text");
            }
        }
    }

    public static void validateTiming(WodJson.Timing timing) {
        if (timing == null) return;
        if (timing.rounds() < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "TIMING_ROUNDS: rounds must be at least 1");
        }
        if (timing.segments() == null) return;
        for (WodJson.Segment s : timing.segments()) {
            if (!"WORK".equals(s.kind()) && !"REST".equals(s.kind())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SEGMENT_KIND: must be WORK or REST");
            }
            if (s.seconds() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SEGMENT_SECONDS: must be positive");
            }
            // ponytail: upper bound is unchecked here; the editor keeps the reference in step, and
            // the TV must tolerate an index it cannot resolve.
            if (s.blockIndex() != null && s.blockIndex() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "SEGMENT_BLOCK: blockIndex must not be negative");
            }
            if ("REST".equals(s.kind()) && s.blockIndex() != null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "SEGMENT_BLOCK: a rest segment names no block");
            }
        }
    }
}
