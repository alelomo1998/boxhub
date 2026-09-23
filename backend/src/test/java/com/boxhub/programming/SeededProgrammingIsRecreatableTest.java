package com.boxhub.programming;

import com.boxhub.shared.DevDataSeeder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the D14 user rule that every piece DevDataSeeder programs into the dev stack is one the
 * real flow (WodJsonValidator + the editor) could have produced -- not a hand-built JSON string
 * nobody validated. No Spring context, no database: DevDataSeeder's blocks builders are pure
 * functions of movement ids, and WodService's serialize/deserialize only need an ObjectMapper.
 */
class SeededProgrammingIsRecreatableTest {

    private final ObjectMapper om = new ObjectMapper();
    // unused by serialize/deserialize/normaliseScales -- the round trip touches no repository.
    private final WodService wodService = new WodService(null, null, null, null, om);

    private static final UUID BACK_SQUAT = UUID.randomUUID();
    private static final UUID ROW = UUID.randomUUID();
    private static final UUID BURPEE = UUID.randomUUID();
    private static final UUID WALL_BALL = UUID.randomUUID();
    private static final UUID DOUBLE_UNDER = UUID.randomUUID();
    private static final UUID DEADLIFT = UUID.randomUUID();
    private static final UUID BOX_JUMP = UUID.randomUUID();
    private static final UUID STEP_UP = UUID.randomUUID();

    @Test
    void everySeededBlocksDocumentValidates() {
        WodJsonValidator.validateBlocks(DevDataSeeder.warmupBlocks());
        WodJsonValidator.validateBlocks(DevDataSeeder.strengthBlocks(BACK_SQUAT));
        WodJsonValidator.validateBlocks(DevDataSeeder.burnerBlocks(ROW, BURPEE, WALL_BALL));
        WodJsonValidator.validateBlocks(DevDataSeeder.chipperBlocks(DOUBLE_UNDER, DEADLIFT, BOX_JUMP, STEP_UP));
        WodJsonValidator.validateBlocks(WodJson.Blocks.empty()); // the bodyText-only piece
    }

    @Test
    void warmupBlocksConversionIsByteIdenticalToTheOriginalHandString() throws Exception {
        String original = "{\"blocks\":[{\"lines\":["
                + "{\"text\":\"easy row\",\"reps\":\"5 min\"},"
                + "{\"text\":\"hip openers\"},"
                + "{\"text\":\"empty-bar work\"}"
                + "]}]}";
        assertThat(om.writeValueAsString(DevDataSeeder.warmupBlocks())).isEqualTo(original);
    }

    @Test
    void strengthBlocksConversionIsByteIdenticalToTheOriginalHandString() throws Exception {
        String original = "{\"blocks\":[{\"note\":\"@ 80% — log your top set\",\"lines\":["
                + "{\"text\":\"Back Squat\",\"movementId\":\"" + BACK_SQUAT + "\",\"reps\":\"5x5\",\"unit\":\"REPS\"}"
                + "]}]}";
        assertThat(om.writeValueAsString(DevDataSeeder.strengthBlocks(BACK_SQUAT))).isEqualTo(original);
    }

    @Test
    void chipperNestsExactlyTwoLevelsAndSubBlocksCarryNoFurtherBlocks() {
        WodJson.Blocks chipper = DevDataSeeder.chipperBlocks(DOUBLE_UNDER, DEADLIFT, BOX_JUMP, STEP_UP);

        assertThat(chipper.blocks()).hasSize(1); // one outer block
        WodJson.Block outer = chipper.blocks().get(0);
        assertThat(outer.lines()).isNullOrEmpty(); // the outer block prescribes nothing itself
        assertThat(outer.blocks()).hasSize(3); // Buy-in, 3 rounds, Cash-out

        for (WodJson.Block sub : outer.blocks()) {
            assertThat(sub.blocks()).isNullOrEmpty(); // a sub-block must not nest further
        }
        assertThat(outer.blocks().get(1).label()).isEqualTo("3 rounds");
        assertThat(outer.blocks().get(1).note()).isEqualTo("keep the bar moving");

        WodJsonValidator.validateBlocks(chipper); // does not throw -- BLOCK_DEPTH would if this were wrong
    }

    @Test
    void aLineWithAScaleSurvivesWodServicesSerializeDeserializeRoundTrip() throws Exception {
        WodJson.Blocks chipper = DevDataSeeder.chipperBlocks(DOUBLE_UNDER, DEADLIFT, BOX_JUMP, STEP_UP);
        // package-private on purpose (test lives in com.boxhub.programming): the same two methods
        // WodController's read/write path calls.
        String json = wodService.serialize(chipper);
        WodJson.Blocks roundTripped = wodService.deserialize(json);

        WodJson.Line boxJumpLine = roundTripped.blocks().get(0).blocks().get(1).lines().get(1);
        assertThat(boxJumpLine.text()).isEqualTo("Box Jump");
        assertThat(boxJumpLine.scales()).hasSize(1);
        WodJson.Scale scale = boxJumpLine.scales().get(0);
        assertThat(scale.text()).isEqualTo("Step-Up");
        assertThat(scale.movementId()).isEqualTo(STEP_UP);
    }
}
