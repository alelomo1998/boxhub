package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ClassTemplateApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired ClassSessionRepository sessions;
    @Autowired ScheduleSlotRepository slots;
    @Autowired BookingRepository bookings;

    String adminToken, athleteToken, otherAdminToken, coachToken;
    Box a, b;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        a = newBox("CT A " + n, "ct-a-" + n);
        b = newBox("CT B " + n, "ct-b-" + n);
        adminToken = boxToken("cta-" + n + "@t.io", a, "BOX_ADMIN");
        athleteToken = boxToken("ctath-" + n + "@t.io", a, "ATHLETE");
        otherAdminToken = boxToken("ctb-" + n + "@t.io", b, "BOX_ADMIN");
        coachToken = boxToken("ctc-" + n + "@t.io", a, "COACH");
    }

    @AfterEach
    void clearContext() { SecurityContextHolder.clearContext(); }

    // Since M21 a tenant-less read fails CLOSED (docs/TENANCY.md): no ambient tenant means the
    // filter stays on with a sentinel no row carries, so a direct repository read returns EMPTY
    // rather than everything. MockMvc calls carry their own auth via the Bearer token and don't
    // need this; only direct sessions/slots/bookings reads and writes do.
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private UUID createSlot(String name, int weekday, String startTime) throws Exception {
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"" + name + "\",\"weekday\":" + weekday
                                + ",\"startTime\":\"" + startTime + "\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(om.readTree(body).get("id").asText());
    }

    private ClassSession firstFutureSession(UUID slotId) {
        actAsBox(a.getId());
        return sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, Instant.now()).stream()
                .min(Comparator.comparing(ClassSession::getStartAt))
                .orElseThrow();
    }

    // Saves a Booking row directly rather than going through BookingService.book (which needs an
    // entitled subscription) — existsBySessionIdAndStatusIn is all SlotRegenerationService checks.
    private void bookSession(UUID sessionId) {
        actAsBox(a.getId());
        User u = authService.register("booker-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Booker");
        Membership m = new Membership();
        m.setUser(u); m.setBox(a); m.setRole("ATHLETE");
        memberships.save(m);

        Booking booking = new Booking();
        booking.setSessionId(sessionId);
        booking.setMembershipId(m.getId());
        booking.setStatus("BOOKED");
        bookings.save(booking);
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void adminCreatesListsPatchesTemplate() throws Exception {
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"WOD 06:00\",\"weekday\":0,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("WOD 06:00"))
                .andExpect(jsonPath("$.weekday").value(0))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(get("/api/box/class-templates").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("WOD 06:00"));

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"capacity\":15,\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.capacity").value(15))
                .andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void athleteCannotCreate() throws Exception {
        mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"X\",\"weekday\":0,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void coachCannotCreate() throws Exception {
        mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken)
                        .content("{\"name\":\"X\",\"weekday\":0,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void coachCannotPatch() throws Exception {
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Y\",\"weekday\":1,\"startTime\":\"07:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();
        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coachToken).content("{\"capacity\":10}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidWeekdayIs400() throws Exception {
        mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"X\",\"weekday\":9,\"startTime\":\"06:00\",\"durationMin\":60,\"capacity\":12}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        String body = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Mine\",\"weekday\":1,\"startTime\":\"18:00\",\"durationMin\":60,\"capacity\":10}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherAdminToken)
                        .content("{\"capacity\":99}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void settingsPatchRoundTripsBookingFields() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"cancelCutoffMin\":90,\"bookingHorizonWeeks\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelCutoffMin").value(90))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(3));

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.cancelCutoffMin").value(90))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(3));
    }

    @Test
    void settingsPatchAppliesTimezoneAloneWithoutDisturbingOtherFields() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"cancelCutoffMin\":45,\"bookingHorizonWeeks\":2}"))
                .andExpect(status().isOk());

        // Timezone ONLY — every other field must survive untouched.
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"timezone\":\"America/New_York\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timezone").value("America/New_York"))
                .andExpect(jsonPath("$.cancelCutoffMin").value(45))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(2));
    }

    /**
     * BoxController.patchSettings maps a blank logoUrl to null (not to ""): see
     * {@code req.logoUrl().isBlank() ? null : req.logoUrl().trim()}. So the "clear" round trip
     * observes the field disappearing from the JSON (null), never an empty string.
     */
    @Test
    void settingsPatchCanClearTheLogoUrl() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"logoUrl\":\"https://example.test/logo.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoUrl").value("https://example.test/logo.png"));

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"logoUrl\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoUrl").doesNotExist());
    }

    /**
     * Since M11 T4 the stored imagePath is minted into a signed nginx secure_link URL, so an
     * unvalidated path is a capability to read someone else's file: box A's admin could store box
     * B's media path and have us sign it for them. Own-box path must round-trip (and come back
     * signed), foreign-box path must be refused. The second half fails against the unguarded
     * version — it returned 200 and a valid signature over box B's file.
     */
    @Test
    void templateImageMustBeThisBoxsOwnMediaPath() throws Exception {
        String id = om.readTree(mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                                .header("Authorization", "Bearer " + adminToken)
                                .content("{\"name\":\"Img\",\"weekday\":1,\"startTime\":\"07:00\",\"durationMin\":60,\"capacity\":10}"))
                        .andExpect(status().isCreated())
                        .andReturn().getResponse().getContentAsString())
                .get("id").asText();

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"imagePath\":\"/media/" + a.getId() + "/mine.jpg\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imagePath").value(org.hamcrest.Matchers.containsString("md5=")));

        mvc.perform(patch("/api/box/class-templates/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"imagePath\":\"/media/" + b.getId() + "/theirs.jpg\"}"))
                .andExpect(status().isForbidden());
    }

    /**
     * fix round 1, finding 1: class_type carries unique (box_id, name), and a class scheduled on
     * several weekdays is exactly one type with several slots — the whole point of the split. A
     * second POST of a name the box already has must reuse that type (201, not 500) and share its
     * imagePath; each POST still creates its own slot (distinct id, own weekday).
     */
    @Test
    void secondPostOfAnExistingNameFindsTheTypeInsteadOf500() throws Exception {
        String first = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"WOD Class\",\"weekday\":0,\"startTime\":\"18:00\",\"durationMin\":60,\"capacity\":14}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String firstId = om.readTree(first).get("id").asText();

        String second = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"WOD Class\",\"weekday\":1,\"startTime\":\"18:00\",\"durationMin\":60,\"capacity\":14}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("WOD Class"))
                .andExpect(jsonPath("$.weekday").value(1))
                .andReturn().getResponse().getContentAsString();
        String secondId = om.readTree(second).get("id").asText();

        assertThat(secondId).isNotEqualTo(firstId); // its own slot
        mvc.perform(get("/api/box/class-templates").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'WOD Class')]", org.hamcrest.Matchers.hasSize(2)));
    }

    /**
     * fix round 1, finding 4: PATCHing a slot's name to a value ANOTHER class_type in the box already
     * holds must re-parent the slot onto that existing type (200), not collide on unique (box_id, name)
     * (was 500). Renaming to a name no type holds still renames the shared type in place, unchanged.
     */
    @Test
    void patchingNameToAnExistingTypeReparentsInsteadOf500() throws Exception {
        String wodBody = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"WOD Class\",\"weekday\":0,\"startTime\":\"18:00\",\"durationMin\":60,\"capacity\":14}"))
                .andReturn().getResponse().getContentAsString();

        String burnItBody = mvc.perform(post("/api/box/class-templates").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Burn It\",\"weekday\":0,\"startTime\":\"19:00\",\"durationMin\":45,\"capacity\":12}"))
                .andReturn().getResponse().getContentAsString();
        String burnItId = om.readTree(burnItBody).get("id").asText();

        mvc.perform(patch("/api/box/class-templates/" + burnItId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"WOD Class\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("WOD Class"));

        mvc.perform(get("/api/box/class-templates").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'WOD Class')]", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$[?(@.name == 'Burn It')]", org.hamcrest.Matchers.hasSize(0)));
    }

    /**
     * defect: patch() routed a schedule-affecting edit through the additive-only generator, which
     * creates sessions that don't exist and skips ones that do but never deletes. Moving a slot from
     * 06:00 to 07:00 left every already-generated 06:00 session in place. Fixed by routing through
     * SlotRegenerationService.
     */
    @Test
    void movingASlotLeavesNoSessionAtTheOldTime() throws Exception {
        UUID slotId = createSlot("CrossFit", 1, "06:00");

        mvc.perform(patch("/api/box/class-templates/" + slotId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"startTime\":\"07:00\"}"))
                .andExpect(status().isOk());

        actAsBox(a.getId());
        ZoneId tz = ZoneId.of(a.getTimezone());
        assertThat(sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, Instant.now()))
                .as("every future session must sit at the NEW time; an additive generate leaves the old ones")
                .isNotEmpty()
                .allSatisfy(s -> assertThat(LocalTime.ofInstant(s.getStartAt(), tz)).isEqualTo(LocalTime.of(7, 0)));
    }

    @Test
    void editingASlotWithABookedSessionIsRefusedAndChangesNothing() throws Exception {
        UUID slotId = createSlot("CrossFit", 1, "06:00");
        ClassSession booked = firstFutureSession(slotId);
        bookSession(booked.getId());

        mvc.perform(patch("/api/box/class-templates/" + slotId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"startTime\":\"07:00\"}"))
                .andExpect(status().isConflict())
                .andExpect(result -> assertThat(result.getResolvedException().getMessage())
                        .contains("RANGE_HAS_BOOKINGS")
                        .contains(LocalDate.ofInstant(booked.getStartAt(), ZoneId.of(a.getTimezone())).toString()));

        actAsBox(a.getId());
        assertThat(slots.findById(slotId).orElseThrow().getStartTime())
                .as("a refused edit must not have written the slot either")
                .isEqualTo(LocalTime.of(6, 0));
    }

    @Test
    void applyFromPastTheBlockingDatesSucceedsAndKeepsTheBookedSessionAtTheOldTime() throws Exception {
        UUID slotId = createSlot("CrossFit", 1, "06:00");
        ClassSession booked = firstFutureSession(slotId);
        bookSession(booked.getId());
        ZoneId tz = ZoneId.of(a.getTimezone());
        LocalDate after = LocalDate.ofInstant(booked.getStartAt(), tz).plusDays(1);

        mvc.perform(patch("/api/box/class-templates/" + slotId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"startTime\":\"07:00\",\"applyFrom\":\"" + after + "\"}"))
                .andExpect(status().isOk());

        actAsBox(a.getId());
        assertThat(sessions.findById(booked.getId()).orElseThrow().getStartAt())
                .as("the already-booked session keeps its old time")
                .isEqualTo(booked.getStartAt());

        // Asserting only the non-effect above is not enough: this test passed even against the OLD
        // additive-only generator, which never deleted anything and so never disturbed the booked
        // session either. Proving the mechanism ran means showing something AFTER applyFrom
        // actually moved — without this, a regression where regeneration silently did nothing
        // would still go green.
        Instant afterInstant = after.atStartOfDay(tz).toInstant();
        assertThat(sessions.findByScheduleSlotIdAndStartAtGreaterThanEqual(slotId, afterInstant))
                .as("sessions from applyFrom onward must have moved to the new time")
                .isNotEmpty()
                .allSatisfy(s -> assertThat(LocalTime.ofInstant(s.getStartAt(), tz)).isEqualTo(LocalTime.of(7, 0)));
    }

    @Test
    void aRenameUpdatesFutureSessionsInPlaceAndIsNeverRefused() throws Exception {
        UUID slotId = createSlot("CrossFit", 1, "06:00");
        ClassSession booked = firstFutureSession(slotId);
        bookSession(booked.getId());   // would REFUSE a regeneration; a rename must not regenerate

        mvc.perform(patch("/api/box/class-templates/" + slotId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Barbell Club\"}"))
                .andExpect(status().isOk());

        actAsBox(a.getId());
        assertThat(sessions.findById(booked.getId()).orElseThrow().getName())
                .as("ClassSession.name is a snapshot, so a rename must rewrite future sessions in place")
                .isEqualTo("Barbell Club");
    }
}
