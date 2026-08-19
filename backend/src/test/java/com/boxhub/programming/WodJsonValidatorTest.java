package com.boxhub.programming;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WodJsonValidatorTest {

    private WodJson.Block leaf(String label) {
        return new WodJson.Block(label, null, List.of(new WodJson.Line("10 squats", null, "10", null, null)), null);
    }

    @Test
    void oneLevelIsValid() {                       // existing content must stay valid
        WodJson.Blocks b = new WodJson.Blocks(List.of(leaf("Warmup")));
        WodJsonValidator.validateBlocks(b);        // does not throw
    }

    @Test
    void twoLevelsAreValid() {                     // spec decision 8
        WodJson.Block macro = new WodJson.Block("Strength", null, List.of(), List.of(leaf("A"), leaf("B")));
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(macro)));
    }

    @Test
    void aMacroMayHoldLinesDirectly() {             // no synthetic wrapper for a simple warmup
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(leaf("Warmup"))));
    }

    @Test
    void threeLevelsAreRejected() {                 // the cap is a validator, so it MUST be tested
        WodJson.Block inner = new WodJson.Block("inner", null, List.of(), List.of(leaf("deep")));
        WodJson.Block macro = new WodJson.Block("macro", null, List.of(), List.of(inner));
        assertThatThrownBy(() -> WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(macro))))
                .hasMessageContaining("BLOCK_DEPTH");
    }

    @Test
    void tabataRoundTrips() {                       // the tour's own table, verbatim
        WodJson.Timing t = new WodJson.Timing(8, List.of(
                new WodJson.Segment(20, "WORK", null),
                new WodJson.Segment(10, "REST", null)));
        WodJsonValidator.validateTiming(t);
        assertThat(t.segments()).hasSize(2);
    }

    @Test
    void theCoachesMixedIntervalRoundTrips() {
        WodJson.Timing t = new WodJson.Timing(5, List.of(
                new WodJson.Segment(30, "WORK", "squat"),
                new WodJson.Segment(15, "REST", null),
                new WodJson.Segment(30, "WORK", "burpees")));
        WodJsonValidator.validateTiming(t);
    }

    @Test
    void aSegmentKindMustBeWorkOrRest() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(60, "SLEEP", null)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_KIND");
    }

    @Test
    void segmentSecondsMustBePositive() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(0, "WORK", null)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_SECONDS");
    }
}
