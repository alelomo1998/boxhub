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

    public static void validateBlocks(WodJson.Blocks blocks) {
        if (blocks == null || blocks.blocks() == null) return;
        for (WodJson.Block b : blocks.blocks()) {
            List<WodJson.Block> children = b.blocks();
            if (children == null) continue;
            for (WodJson.Block child : children) {
                if (child.blocks() != null && !child.blocks().isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "BLOCK_DEPTH: blocks nest at most two levels");
                }
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
        }
    }
}
