package com.boxhub.box;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure window arithmetic, pinned to explicit dates. Nothing here reads the clock — a calendar test
 * that is green most days is a coin flip, not coverage (SlotRegenerationTest, 2026-08-22).
 *
 * Europe/Rome throughout, and 2026-03-29 is deliberately DST-transition day in that zone: the local
 * day is 23 hours long, which is exactly the case a naive `plus(24h)` gets wrong.
 */
class PlanLimitsTest {

    private static final ZoneId ROME = ZoneId.of("Europe/Rome");

    private static Instant at(String isoLocalDate, int hour) {
        return LocalDate.parse(isoLocalDate).atStartOfDay(ROME).plusHours(hour).toInstant();
    }

    private static Subscription sub(Instant start, Instant end) {
        Subscription s = new Subscription();
        s.setCurrentPeriodStart(start);
        s.setCurrentPeriodEnd(end);
        return s;
    }

    @Test
    void dayWindowIsMidnightToMidnightInTheBoxTimezone() {
        Instant[] w = PlanLimits.window(PlanLimits.Period.DAY, at("2026-08-12", 18), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-12", 0));
        assertThat(w[1]).isEqualTo(at("2026-08-13", 0));
    }

    @Test
    void dayWindowSurvivesTheDstTransitionAsTwentyThreeHours() {
        Instant[] w = PlanLimits.window(PlanLimits.Period.DAY, at("2026-03-29", 12), ROME, sub(null, null));
        assertThat(w[1].getEpochSecond() - w[0].getEpochSecond()).isEqualTo(23 * 3600L);
    }

    @Test
    void weekWindowRunsMondayToMonday() {
        // 2026-08-12 is a Wednesday; its week starts Monday 2026-08-10.
        Instant[] w = PlanLimits.window(PlanLimits.Period.WEEK, at("2026-08-12", 7), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-10", 0));
        assertThat(w[1]).isEqualTo(at("2026-08-17", 0));
    }

    @Test
    void weekWindowOfASundayIsThatSundaysWeekNotTheNextOne() {
        // 2026-08-16 is a Sunday. previousOrSame(MONDAY) must reach BACK to the 10th, not forward.
        Instant[] w = PlanLimits.window(PlanLimits.Period.WEEK, at("2026-08-16", 23), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-10", 0));
        assertThat(w[1]).isEqualTo(at("2026-08-17", 0));
    }

    @Test
    void monthWindowIsTheFirstToTheFirst() {
        Instant[] w = PlanLimits.window(PlanLimits.Period.MONTH, at("2026-08-12", 7), ROME, sub(null, null));
        assertThat(w[0]).isEqualTo(at("2026-08-01", 0));
        assertThat(w[1]).isEqualTo(at("2026-09-01", 0));
    }

    @Test
    void totalWindowIsTheSubscriptionTermNotTheCalendar() {
        Instant start = at("2026-08-01", 9);
        Instant end = at("2026-08-31", 9);
        Instant[] w = PlanLimits.window(PlanLimits.Period.TOTAL, at("2026-08-12", 7), ROME, sub(start, end));
        assertThat(w[0]).isEqualTo(start);
        assertThat(w[1]).isEqualTo(end);
    }

    @Test
    void totalWindowOfAGrandfatheredNullEndSubscriptionNeverCloses() {
        Instant start = at("2026-08-01", 9);
        Instant[] w = PlanLimits.window(PlanLimits.Period.TOTAL, at("2026-08-12", 7), ROME, sub(start, null));
        assertThat(w[1]).isEqualTo(PlanLimits.FAR_FUTURE);
    }

    @Test
    void entryRulesAreTotalThenMonthThenWeekThenDay() {
        assertThat(PlanLimits.ENTRY_RULES).extracting(PlanLimits.Rule::period)
                .containsExactly(PlanLimits.Period.TOTAL, PlanLimits.Period.MONTH,
                        PlanLimits.Period.WEEK, PlanLimits.Period.DAY);
        assertThat(PlanLimits.ENTRY_RULES).allMatch(r -> r.kind() == PlanLimits.UsageKind.ENTRY);
        assertThat(PlanLimits.ENTRY_RULES).extracting(PlanLimits.Rule::code)
                .containsExactly("ENTRIES_TOTAL", "ENTRIES_PER_MONTH", "ENTRIES_PER_WEEK", "ENTRIES_PER_DAY");
    }

    @Test
    void cancellationRulesMirrorThemAndReadTheCancellationColumns() {
        Plan p = new Plan();
        p.setCancellationsPerDay(1);
        p.setCancellationsPerWeek(2);
        p.setCancellationsPerMonth(3);
        p.setCancellationsTotal(4);
        assertThat(PlanLimits.CANCELLATION_RULES).extracting(r -> r.limit().apply(p))
                .containsExactly(4, 3, 2, 1);
        assertThat(PlanLimits.CANCELLATION_RULES).allMatch(r -> r.kind() == PlanLimits.UsageKind.CANCELLATION);
    }

    @Test
    void entryRulesReadTheEntryColumns() {
        Plan p = new Plan();
        p.setEntriesPerDay(1);
        p.setEntriesPerWeek(2);
        p.setEntriesPerMonth(3);
        p.setEntriesTotal(4);
        assertThat(PlanLimits.ENTRY_RULES).extracting(r -> r.limit().apply(p)).containsExactly(4, 3, 2, 1);
    }
}
