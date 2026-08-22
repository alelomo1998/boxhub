package com.boxhub.box;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.function.Function;

/**
 * The eight limits, their evaluation order, and the window each one is counted over. Pure: no Spring,
 * no database, no clock. Everything it needs is passed in.
 *
 * Two things this class encodes, both from the spec:
 *
 * 1. Limits compose with AND. Every limit that is set must pass; there is no precedence between
 *    periods and no "tightest wins". The fixed TOTAL -> MONTH -> WEEK -> DAY order exists only so the
 *    athlete is told WHICH rule stopped them; the outcome is identical whichever order runs.
 *
 * 2. Every window is anchored to the SESSION BEING BOOKED, not to now(). Booking next Tuesday counts
 *    against next Tuesday's day and week. Anchoring to now() would let an athlete drain the wrong
 *    week by booking far ahead, and would make the counts disagree with what the calendar shows.
 */
public final class PlanLimits {

    private PlanLimits() {}

    public enum UsageKind { ENTRY, CANCELLATION }

    public enum Period { TOTAL, MONTH, WEEK, DAY }

    /** A subscription with no end (grandfathered or comped) has a term that never closes. Not
     *  Instant.MAX — that overflows a Postgres timestamptz on the way into the query. */
    public static final Instant FAR_FUTURE = Instant.parse("9999-12-31T00:00:00Z");

    public record Rule(UsageKind kind, Period period, Function<Plan, Integer> limit, String code) {}

    public static final List<Rule> ENTRY_RULES = List.of(
            new Rule(UsageKind.ENTRY, Period.TOTAL, Plan::getEntriesTotal, "ENTRIES_TOTAL"),
            new Rule(UsageKind.ENTRY, Period.MONTH, Plan::getEntriesPerMonth, "ENTRIES_PER_MONTH"),
            new Rule(UsageKind.ENTRY, Period.WEEK, Plan::getEntriesPerWeek, "ENTRIES_PER_WEEK"),
            new Rule(UsageKind.ENTRY, Period.DAY, Plan::getEntriesPerDay, "ENTRIES_PER_DAY"));

    public static final List<Rule> CANCELLATION_RULES = List.of(
            new Rule(UsageKind.CANCELLATION, Period.TOTAL, Plan::getCancellationsTotal, "CANCELLATIONS_TOTAL"),
            new Rule(UsageKind.CANCELLATION, Period.MONTH, Plan::getCancellationsPerMonth, "CANCELLATIONS_PER_MONTH"),
            new Rule(UsageKind.CANCELLATION, Period.WEEK, Plan::getCancellationsPerWeek, "CANCELLATIONS_PER_WEEK"),
            new Rule(UsageKind.CANCELLATION, Period.DAY, Plan::getCancellationsPerDay, "CANCELLATIONS_PER_DAY"));

    /** Half-open [from, to) in the box's timezone, anchored to the session's own start. */
    public static Instant[] window(Period period, Instant sessionStartAt, ZoneId tz, Subscription sub) {
        LocalDate date = sessionStartAt.atZone(tz).toLocalDate();
        return switch (period) {
            case DAY -> range(date, date.plusDays(1), tz);
            case WEEK -> {
                LocalDate monday = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
                yield range(monday, monday.plusWeeks(1), tz);
            }
            case MONTH -> {
                LocalDate first = date.withDayOfMonth(1);
                yield range(first, first.plusMonths(1), tz);
            }
            // The term, not the calendar: a monthly subscription's total resets every month and an
            // annual one's every year, with no new date arithmetic and nothing for an admin to reset.
            case TOTAL -> new Instant[]{
                    sub.getCurrentPeriodStart(),
                    sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd() : FAR_FUTURE};
        };
    }

    // atStartOfDay(zone), not atStartOfDay().atZone(...): on a DST-transition day the local day is 23
    // or 25 hours long, and only the zoned form gets that right.
    private static Instant[] range(LocalDate from, LocalDate to, ZoneId tz) {
        return new Instant[]{from.atStartOfDay(tz).toInstant(), to.atStartOfDay(tz).toInstant()};
    }
}
