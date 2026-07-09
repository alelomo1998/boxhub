package com.boxhub.performance;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LeaderboardTest {

    private WodScore score(boolean rx, boolean priv, Integer time, boolean finished, Integer reps,
                           Integer rounds, String load) {
        WodScore s = new WodScore();
        s.setRx(rx); s.setPrivate(priv); s.setTimeSeconds(time); s.setFinished(finished);
        s.setReps(reps); s.setRounds(rounds); s.setLoad(load == null ? null : new BigDecimal(load));
        s.setNotes(rx + "/" + time + "/" + load); // marker
        return s;
    }

    @Test
    void timeOrdersFinishedAscThenUnfinishedByRepsAndRxFirst() {
        WodScore rxFast = score(true, false, 150, true, null, null, null);
        WodScore rxSlow = score(true, false, 200, true, null, null, null);
        WodScore rxCapped = score(true, false, null, false, 90, null, null); // hit cap, 90 reps
        WodScore scaledFast = score(false, false, 120, true, null, null, null);

        List<WodScore> out = Leaderboard.rank(List.of(rxSlow, scaledFast, rxCapped, rxFast), "TIME");
        // RX block first: finished (150, 200) then capped; then scaled block
        assertThat(out).containsExactly(rxFast, rxSlow, rxCapped, scaledFast);
    }

    @Test
    void roundsRepsOrderDesc() {
        WodScore a = score(true, false, null, true, 12, 5, null);
        WodScore b = score(true, false, null, true, 3, 6, null);
        WodScore c = score(true, false, null, true, 20, 5, null);
        List<WodScore> out = Leaderboard.rank(List.of(a, b, c), "ROUNDS_REPS");
        assertThat(out).containsExactly(b, c, a); // 6r > 5r+20 > 5r+12
    }

    @Test
    void loadOrderDesc() {
        WodScore light = score(true, false, null, true, null, null, "100.0");
        WodScore heavy = score(true, false, null, true, null, null, "140.5");
        List<WodScore> out = Leaderboard.rank(List.of(light, heavy), "LOAD");
        assertThat(out).containsExactly(heavy, light);
    }

    @Test
    void privateScoresExcluded() {
        WodScore pub = score(true, false, 150, true, null, null, null);
        WodScore secret = score(true, true, 100, true, null, null, null);
        List<WodScore> out = Leaderboard.rank(List.of(secret, pub), "TIME");
        assertThat(out).containsExactly(pub);
    }
}
