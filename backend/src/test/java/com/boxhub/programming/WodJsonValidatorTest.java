package com.boxhub.programming;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WodJsonValidatorTest {

    private WodJson.Block leaf(String label) {
        return new WodJson.Block(label, null,
                List.of(new WodJson.Line("10 squats", null, "10", null, null, null, null)), null);
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
                new WodJson.Segment(20, "WORK", null, 0),
                new WodJson.Segment(10, "REST", null, null)));
        WodJsonValidator.validateTiming(t);
        assertThat(t.segments()).hasSize(2);
    }

    @Test
    void theCoachesMixedIntervalRoundTrips() {
        WodJson.Timing t = new WodJson.Timing(5, List.of(
                new WodJson.Segment(30, "WORK", "squat", 0),
                new WodJson.Segment(15, "REST", null, null),
                new WodJson.Segment(30, "WORK", "burpees", 1)));
        WodJsonValidator.validateTiming(t);
    }

    @Test
    void aSegmentKindMustBeWorkOrRest() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(60, "SLEEP", null, null)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_KIND");
    }

    @Test
    void segmentSecondsMustBePositive() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(0, "WORK", null, null)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_SECONDS");
    }

    @Test
    void aWorkSegmentWithABlockIndexValidates() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(20, "WORK", null, 0)));
        WodJsonValidator.validateTiming(t);            // does not throw
    }

    @Test
    void aWorkSegmentWithNoBlockIndexValidates() {      // unassigned is legal, coach hasn't picked yet
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(20, "WORK", null, null)));
        WodJsonValidator.validateTiming(t);            // does not throw
    }

    @Test
    void aNegativeBlockIndexIsRejected() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(20, "WORK", null, -1)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_BLOCK");
    }

    @Test
    void aRestSegmentNamingABlockIsRejected() {
        WodJson.Timing t = new WodJson.Timing(1, List.of(new WodJson.Segment(10, "REST", null, 0)));
        assertThatThrownBy(() -> WodJsonValidator.validateTiming(t)).hasMessageContaining("SEGMENT_BLOCK");
    }

    @Test
    void aLineMayCarrySeveralScalingOptions() {          // spec 5A, user-asked 2026-09-07
        WodJson.Line line = new WodJson.Line("Muscle-up", null, "6", null, null, List.of(
                new WodJson.Scale("Pull-up", null, "12", null, null),
                new WodJson.Scale("Ring row", null, "20", null, null)), null);
        WodJson.Block block = new WodJson.Block("A", null, List.of(line), null);
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(block)));  // does not throw
    }

    @Test
    void moreThanSixScalesIsRejected() {
        List<WodJson.Scale> seven = java.util.stream.IntStream.range(0, 7)
                .mapToObj(i -> new WodJson.Scale("alt " + i, null, "1", null, null)).toList();
        WodJson.Line line = new WodJson.Line("Muscle-up", null, "6", null, null, seven, null);
        WodJson.Block block = new WodJson.Block("A", null, List.of(line), null);
        assertThatThrownBy(() -> WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(block))))
                .hasMessageContaining("SCALE_COUNT");
    }

    @Test
    void aScaleWithNoTextAndNoMovementIsRejected() {
        WodJson.Line line = new WodJson.Line("Muscle-up", null, "6", null, null,
                List.of(new WodJson.Scale(null, null, null, null, null)), null);
        WodJson.Block block = new WodJson.Block("A", null, List.of(line), null);
        assertThatThrownBy(() -> WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(block))))
                .hasMessageContaining("SCALE_EMPTY");
    }

    @Test
    void theScaleCapAppliesInsideNestedBlocksToo() {     // the cap must walk BOTH levels
        List<WodJson.Scale> seven = java.util.stream.IntStream.range(0, 7)
                .mapToObj(i -> new WodJson.Scale("alt " + i, null, "1", null, null)).toList();
        WodJson.Line line = new WodJson.Line("Muscle-up", null, "6", null, null, seven, null);
        WodJson.Block inner = new WodJson.Block("inner", null, List.of(line), null);
        WodJson.Block macro = new WodJson.Block("macro", null, List.of(), List.of(inner));
        assertThatThrownBy(() -> WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(macro))))
                .hasMessageContaining("SCALE_COUNT");
    }

    @Test
    void aLineWithAKnownUnitValidates() {
        WodJson.Line line = new WodJson.Line("Assault Bike", null, null, null, null, null, "CAL");
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(
                new WodJson.Block("A", null, List.of(line), null))));  // does not throw
    }

    @Test
    void aLineWithNoUnitValidates() {
        WodJson.Line line = new WodJson.Line("Air Squat", null, "10", null, null, null, null);
        WodJsonValidator.validateBlocks(new WodJson.Blocks(List.of(
                new WodJson.Block("A", null, List.of(line), null))));  // does not throw
    }

    @Test
    void aLineWithAnUnknownUnitIsRejected() {
        WodJson.Line line = new WodJson.Line("Assault Bike", null, null, null, null, null, "BANANAS");
        WodJson.Blocks blocks = new WodJson.Blocks(List.of(new WodJson.Block("A", null, List.of(line), null)));
        assertThatThrownBy(() -> WodJsonValidator.validateBlocks(blocks)).hasMessageContaining("LINE_UNIT");
    }
}
