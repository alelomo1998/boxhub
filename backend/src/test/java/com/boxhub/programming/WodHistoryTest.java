package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassSession;
import com.boxhub.box.ClassSessionRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GET /api/box/wods/history?day=YYYY-MM-DD: every piece a class ran that box-local day, in
 * start order. Same MockMvc + JWT harness as WodGrowthTest.
 */
class WodHistoryTest extends AbstractIntegrationTest {

    private static final ZoneId ROME = ZoneId.of("Europe/Rome");

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired ObjectMapper om;

    UUID boxId;
    String coachToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxId = newBox("History " + n, "history-" + n);
        coachToken = tokenFor(boxId, "history-" + n + "@t.io", "COACH");
    }

    private UUID newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private String tokenFor(UUID box, String email, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(box).orElseThrow());
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    /** library = true is a shared library entry; false is a piece that belongs to one class. */
    private UUID createWod(String token, String title, boolean library) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", title);
        body.put("macro", "WORKOUT");
        body.put("timingPreset", "FOR_TIME");
        body.put("scoreType", "TIME");
        body.put("library", library);
        String json = mvc.perform(post("/api/box/wods").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content(om.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(json).get("id").asText());
    }

    private UUID createWod(String title, boolean library) throws Exception {
        return createWod(coachToken, title, library);
    }

    private static String fromLibrary(UUID libraryWodId) {
        return "{\"fromLibraryWodId\":\"" + libraryWodId + "\",\"scoreable\":false}";
    }

    /** A session at a fixed instant. MICROS: see Global Constraints. */
    private UUID seedSessionAt(Instant startAt, String status) {
        return TenantContext.runAsBox(boxId, () -> {
            ClassSession s = new ClassSession();
            s.setName("History Class");
            s.setStartAt(startAt.truncatedTo(ChronoUnit.MICROS));
            s.setDurationMin(60);
            s.setCapacity(12);
            s.setStatus(status);
            return sessions.save(s).getId();
        });
    }

    private void attach(UUID session, UUID... libraryWods) throws Exception {
        String items = java.util.Arrays.stream(libraryWods).map(WodHistoryTest::fromLibrary)
                .collect(java.util.stream.Collectors.joining(","));
        mvc.perform(put("/api/box/sessions/" + session + "/items").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"items\":[" + items + "]}"))
                .andExpect(status().isOk());
    }

    private JsonNode history(String token, String query) throws Exception {
        String json = mvc.perform(get("/api/box/wods/history" + query).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(json);
    }

    private JsonNode historyDays(String token, String from, String to) throws Exception {
        String json = mvc.perform(get("/api/box/wods/history/days?from=" + from + "&to=" + to)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(json);
    }

    /**
     * Deterministic whatever the wall clock is: every seed is built relative to "now" in
     * Europe/Rome rather than a fixed clock time. "Today, already started" (justStarted, a few
     * seconds before now) always exists. "Today, early in the day" (00:30 Rome) and "today, in the
     * future" (now + 1h) only get seeded -- and only enter the expectation -- when that instant
     * actually falls on the intended side of the boundary right now; near midnight one or both may
     * not apply, and this skips just that seed rather than the whole test (no JUnit Assumptions
     * abort, since that would also skip the assertions that don't depend on it).
     */
    @Test
    void listsThatDaysStartedPiecesOnly() throws Exception {
        ZonedDateTime now = ZonedDateTime.now(ROME);
        LocalDate today = now.toLocalDate();
        UUID lib = createWod("Grace", true);

        List<Instant> expectedInstants = new ArrayList<>();
        List<UUID> expectedIds = new ArrayList<>();

        // Today, well started -- clamped to today's first microsecond so a run in the first seconds
        // after Rome midnight never seeds "just started" onto yesterday.
        Instant startOfToday = today.atStartOfDay(ROME).toInstant().plus(1, ChronoUnit.MICROS);
        Instant justStarted = latest(now.minusSeconds(5).toInstant(), startOfToday);
        UUID justStartedSession = seedSessionAt(justStarted, "SCHEDULED");
        attach(justStartedSession, lib);
        expectedInstants.add(justStarted);
        expectedIds.add(justStartedSession);

        // Today, early in the day -- only if 00:30 Rome has already happened.
        ZonedDateTime early = today.atTime(0, 30).atZone(ROME);
        if (early.isBefore(now)) {
            Instant earlyInstant = early.toInstant();
            UUID earlySession = seedSessionAt(earlyInstant, "SCHEDULED");
            attach(earlySession, lib);
            expectedInstants.add(earlyInstant);
            expectedIds.add(earlySession);
        }

        // Yesterday 23:30 -- always strictly in the past, always excluded (wrong day).
        Instant yesterdayLate = today.minusDays(1).atTime(23, 30).atZone(ROME).toInstant();
        attach(seedSessionAt(yesterdayLate, "SCHEDULED"), lib);

        // Today, in the future -- only if now + 1h is still today (not near midnight).
        ZonedDateTime future = now.plusHours(1);
        if (future.toLocalDate().equals(today)) {
            attach(seedSessionAt(future.toInstant(), "SCHEDULED"), lib);
        }

        // Cancelled, today, already started -- excluded regardless.
        attach(seedSessionAt(latest(now.minusSeconds(2).toInstant(), startOfToday), "CANCELLED"), lib);

        // Expected order is start_at ascending -- derive it from the instants, don't hardcode it.
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < expectedInstants.size(); i++) order.add(i);
        order.sort((a, b) -> expectedInstants.get(a).compareTo(expectedInstants.get(b)));

        JsonNode rows = history(coachToken, "?day=" + today);
        assertThat(rows.size()).isEqualTo(expectedIds.size());
        for (int i = 0; i < order.size(); i++) {
            assertThat(rows.get(i).get("sessionId").asText()).isEqualTo(expectedIds.get(order.get(i)).toString());
        }
        assertThat(rows.get(0).get("className").asText()).isEqualTo("History Class");
        assertThat(rows.get(0).get("wod").get("title").asText()).isEqualTo("Grace");
        assertThat(rows.get(0).get("wod").get("id").asText()).isNotEqualTo(lib.toString()); // the class's copy
    }

    private static Instant latest(Instant a, Instant b) { return a.isAfter(b) ? a : b; }

    @Test
    void malformedDayIs400() throws Exception {
        mvc.perform(get("/api/box/wods/history?day=13-09-2026")
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    void athleteIsForbidden() throws Exception {
        String athlete = tokenFor(boxId, "hist-ath-" + System.nanoTime() + "@t.io", "ATHLETE");
        String today = ZonedDateTime.now(ROME).toLocalDate().toString();
        mvc.perform(get("/api/box/wods/history?day=" + today).header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    @Test
    void anotherBoxSeesNoneOfThisBoxsHistory() throws Exception {
        ZonedDateTime now = ZonedDateTime.now(ROME);
        Instant startOfToday = now.toLocalDate().atStartOfDay(ROME).toInstant().plus(1, ChronoUnit.MICROS);
        attach(seedSessionAt(latest(now.minusSeconds(60).toInstant(), startOfToday), "SCHEDULED"), createWod("Grace", true));
        UUID other = newBox("Hist Other " + System.nanoTime(), "hist-o-" + System.nanoTime());
        String otherCoach = tokenFor(other, "hist-oc-" + System.nanoTime() + "@t.io", "COACH");
        String today = ZonedDateTime.now(ROME).toLocalDate().toString();
        assertThat(history(otherCoach, "?day=" + today).size()).isZero();
    }

    /**
     * GET /api/box/wods/history/days: same started/cancelled/future rules as {@link #history},
     * bucketed into distinct box-local days instead of rows.
     */
    @Test
    void daysListsOnlyDaysWithStartedPieces() throws Exception {
        ZonedDateTime now = ZonedDateTime.now(ROME);
        LocalDate today = now.toLocalDate();
        UUID lib = createWod("Fran", true);

        // Today, already started -- the one day that must be listed.
        Instant startOfToday = today.atStartOfDay(ROME).toInstant().plus(1, ChronoUnit.MICROS);
        Instant started = latest(now.minusSeconds(5).toInstant(), startOfToday);
        attach(seedSessionAt(started, "SCHEDULED"), lib);

        // A future session two days out -- in range, not started, must not appear.
        LocalDate futureDay = today.plusDays(2);
        attach(seedSessionAt(futureDay.atTime(12, 0).atZone(ROME).toInstant(), "SCHEDULED"), lib);

        // Yesterday has no sessions at all -- an empty day, must not appear.
        JsonNode days = historyDays(coachToken, today.minusDays(3).toString(), today.plusDays(5).toString());
        List<String> list = new ArrayList<>();
        days.forEach(d -> list.add(d.asText()));
        assertThat(list).containsExactly(today.toString());
    }

    @Test
    void daysRangeOver62DaysIs400() throws Exception {
        LocalDate today = ZonedDateTime.now(ROME).toLocalDate();
        mvc.perform(get("/api/box/wods/history/days?from=" + today + "&to=" + today.plusDays(63))
                        .header("Authorization", "Bearer " + coachToken))
                .andExpect(status().isBadRequest());
    }

    @Test
    void daysAthleteIsForbidden() throws Exception {
        String athlete = tokenFor(boxId, "hist-days-ath-" + System.nanoTime() + "@t.io", "ATHLETE");
        String today = ZonedDateTime.now(ROME).toLocalDate().toString();
        mvc.perform(get("/api/box/wods/history/days?from=" + today + "&to=" + today)
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    @Test
    void anotherBoxSeesNoneOfThisBoxsHistoryDays() throws Exception {
        ZonedDateTime now = ZonedDateTime.now(ROME);
        LocalDate today = now.toLocalDate();
        Instant startOfToday = today.atStartOfDay(ROME).toInstant().plus(1, ChronoUnit.MICROS);
        attach(seedSessionAt(latest(now.minusSeconds(60).toInstant(), startOfToday), "SCHEDULED"), createWod("Fran", true));
        UUID other = newBox("Hist Days Other " + System.nanoTime(), "hist-do-" + System.nanoTime());
        String otherCoach = tokenFor(other, "hist-doc-" + System.nanoTime() + "@t.io", "COACH");
        assertThat(historyDays(otherCoach, today.minusDays(1).toString(), today.plusDays(1).toString()).size()).isZero();
    }
}
