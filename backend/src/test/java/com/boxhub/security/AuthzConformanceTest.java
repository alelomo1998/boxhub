package com.boxhub.security;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.display.TvDevice;
import com.boxhub.display.TvDeviceRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.RefreshTokenRepository;
import com.boxhub.identity.RefreshTokenService;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.performance.LiftEntry;
import com.boxhub.performance.LiftEntryRepository;
import com.boxhub.programming.*;
import com.boxhub.shared.Mailer;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.time.Instant;
import java.time.LocalTime;
import java.util.*;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

/**
 * The M11 standing guarantee, walked over Spring's LIVE route table. Default is DENY: a route that
 * is neither allowlisted (with a justification) nor carrying a declared expectation FAILS, so an
 * endpoint added later cannot quietly skip tenancy.
 *
 * <h2>What every route is actually probed with</h2>
 * <ul>
 *   <li><b>(a) anonymous</b> — no credentials must yield 401. Runs on every non-allowlisted route.</li>
 *   <li><b>(b) foreign box</b> — box B's BOX_ADMIN token against a <b>REAL box-A resource id</b>
 *       (seeded in {@link #fixture()}), with a <b>valid request body</b>, must be denied (403/404).
 *       A random UUID would only prove "unknown id → not 2xx", which any CRUD app satisfies; an
 *       unfiltered {@code repo.findById(id)} would pass it. Real ids are what makes this a
 *       tenancy assertion. A path variable with no seeded counterpart is a hard failure — the
 *       sweep never falls back to a random UUID.</li>
 *   <li><b>(b+) positive control</b> — every url probe (b) denies is re-issued with box A's OWN
 *       admin token and must not 404. Probe (b) is otherwise self-asserting: if a fixture row
 *       drifts (starts 404-ing for everyone, or a bare {@code {id}} falls through to a preceding
 *       segment naming the wrong type) the denial silently degenerates back into "unknown id →
 *       not 2xx" with no signal. These run in a SECOND PASS after the sweep, DELETEs last: they
 *       carry valid bodies and really do mutate, so running them inline would poison later probes.</li>
 *   <li><b>(c) insufficient role</b> — box A's ATHLETE token against every route declaring a role
 *       stricter than ATHLETE (COACH <i>and</i> BOX_ADMIN) must yield 403.</li>
 *   <li><b>(d) collection leak</b> — box B's admin calling a box-scoped collection GET must (i) get
 *       a <b>2xx</b> and (ii) see ZERO box-A rows: the response must contain none of the box-A
 *       markers. The 2xx half is not decoration — a route that 4xx-es (a required
 *       {@code @RequestParam} the probe did not supply, say) contains no marker either, so the leak
 *       assertion would pass VACUOUSLY, which is the exact failure class this sweep exists to kill.
 *       Any route where box B legitimately cannot reach 2xx must therefore be handled explicitly
 *       ({@link #query}) rather than absorbed silently. This is the only thing covering a collection
 *       handler that ignores tenancy entirely (the foreign probe cannot: box B legitimately gets
 *       2xx there, holding its OWN rows).</li>
 *   <li><b>(e) superadmin surface</b> — every {@code /api/admin/**} route must reject a BOX_ADMIN
 *       box token with 403. Box-admin → superadmin escalation is exactly the shape this guarantee
 *       has to own.</li>
 *   <li><b>(f) self surface</b> — {@code /api/me/**}, the authenticated {@code /api/auth/*} routes
 *       and the invite-accept route are probed with a token belonging to a DIFFERENT user;
 *       the response must contain no box-A marker. {@code POST /api/auth/box-token} additionally
 *       gets a real foreign box id in its body and must be denied — it is the one non-box route
 *       that names a tenant.</li>
 * </ul>
 *
 * <h2>Known limits (deliberate, documented rather than hidden)</h2>
 * <ol>
 *   <li>The foreign probe fires only on path-variable routes. On a collection route "deny" is the
 *       wrong assertion, so probe (d) covers that surface by content instead of by status.</li>
 *   <li><b>Foreign ids carried in a request BODY are not probed.</b> {@code POST /api/box/subscriptions}
 *       (membershipId, planId), {@code POST /api/box/subscriptions/checkout} (planId) and
 *       {@code POST /api/box/sessions/{id}/checkin} (bookingId) take ids in the body; the sweep sends
 *       box-A ids only where the route is also id-bearing in its path. Those handlers have their own
 *       targeted cross-tenant tests (SubscriptionApiTest, BookingEntitlementTest).</li>
 *   <li>Probe (d) proves box-A rows are absent, not that the result set is correctly filtered for
 *       every query parameter combination.</li>
 *   <li>{@code @TenantId} only catches JPQL/derived queries on annotated entities — Movement,
 *       TvDevice and Membership are NOT annotated, which is exactly why probes (b) and (d) exist.</li>
 *   <li><b>Probe (d) is a CROSS-BOX assertion only — it cannot see an intra-box leak.</b> Verified,
 *       not assumed: dropping the caller scoping from {@code LiftController.byMovement} (so it
 *       returns every member's lifts) leaves this sweep GREEN, because {@code LiftEntry} is
 *       {@code @TenantId} and the derived query is still box-filtered — box B sees nothing either
 *       way. Only a tenant-filter BYPASS is visible here: the same route re-pointed at a
 *       {@code nativeQuery} with no box predicate fails the assertion immediately. Athlete-vs-
 *       athlete visibility inside one box is a different guarantee and belongs in the per-feature
 *       tests, not here.</li>
 *   <li><b>Three of the seven {@code self} probes are STATUS-ONLY, and must not be read as content
 *       coverage.</b> Probe (f) asserts "no box-A marker in the body"; for
 *       {@code PATCH /api/me/password}, {@code POST /api/me/email} and
 *       {@code POST /api/auth/logout-all} the response is empty or a bare status, so no marker
 *       could ever appear whether the handler is correct or not — the probe there degenerates to
 *       "another user's token does not blow the route up". Real weight in this family is carried
 *       by {@code GET /api/me}, {@code GET /api/me/export} and {@code GET /api/auth/sessions}
 *       (which DO render caller data) and by the explicit {@code POST /api/auth/box-token} denial.
 *       Nothing stronger is cheap here: no {@code /api/me/**} route names another user, so there
 *       is no cross-user id to probe with — they all resolve the caller from
 *       {@code TenantContext.userId()}. A future {@code /api/me/{userId}/…} would hit
 *       {@link #concrete}'s hard failure, not slip through.</li>
 * </ol>
 */
class AuthzConformanceTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    // Qualified: actuator contributes a second RequestMappingHandlerMapping
    // (controllerEndpointHandlerMapping). We want the MVC one — that is where /api/ lives.
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mapping;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired RefreshTokenRepository refreshTokenRepo;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired InviteService inviteService;
    @Autowired ClassTypeRepository classTypes;
    @Autowired ScheduleSlotRepository slots;
    @Autowired ClassSessionRepository sessions;
    @Autowired WodRepository wods;
    @Autowired SessionItemRepository items;
    @Autowired MovementRepository movements;
    @Autowired TvDeviceRepository tvDevices;
    @Autowired BenchmarkTemplateRepository benchmarks;
    @Autowired com.boxhub.box.AnnouncementRepository announcements;
    @Autowired com.boxhub.box.AnnouncementRecipientRepository announcementRecipients;
    @Autowired com.boxhub.notify.NotificationRepository notifications;
    @Autowired LiftEntryRepository lifts;
    @Autowired BookingRepository bookings;
    @MockitoBean Mailer mailer;

    /** ATHLETE and BOX_ADMIN in box A; BOX_ADMIN in box B; box B's admin as a plain user token. */
    private String athleteToken, ownerToken, foreignBoxToken, foreignUserToken;
    private Box boxA;

    /** Path-variable name (or, for a bare {id}, the preceding path segment) -> REAL box-A id. */
    private UUID boxAnnouncementId;
    private UUID boxANotificationId;
    private final Map<String, String> pathIds = new HashMap<>();
    /** Same, for {@code /api/admin/**} only — those probes must NOT touch box A, see {@link #concrete}. */
    private final Map<String, String> adminIds = new HashMap<>();
    /** Strings that must never appear in a response served to box B / to another user. */
    private final List<String> markers = new ArrayList<>();

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    /** @TenantId entities need a box-scoped Authentication before a direct repository save, or the
     *  tenant resolves to the NO_TENANT sentinel and the insert fails on box_id. Same convention as
     *  SubscriptionApiTest.actAsBox. */
    private void actAsBox(UUID boxId, UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(userId.toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @BeforeEach
    void fixture() {
        org.mockito.Mockito.lenient().when(mailer.link(org.mockito.ArgumentMatchers.any()))
                .thenReturn("http://localhost/x");
        long n = System.nanoTime();
        // Appears in the NAME of every box-A row and nowhere in box B, so a leaked row is visible
        // in the response text even when its id is not echoed back.
        String mark = "ZZSWEEPA" + n;

        boxA = newBox("Sweep A " + mark, "sweep-a-" + n);
        Box boxB = newBox("Sweep B " + n, "sweep-b-" + n);
        // Throwaway target for the /api/admin/** probes. They used to resolve {id} to box A via the
        // "boxes" segment, so the `suspend` probe MUTATED the fixture every other probe depends on
        // (that masking is documented in the Task-2 report). Those probes only assert the 403, so
        // the box they name is free.
        Box boxC = newBox("Sweep C " + n, "sweep-c-" + n);

        User athlete = authService.register("sweep-ath-" + n + "@t.io", "correct-horse-battery", "Sweep Athlete");
        Membership athleteMembership = member(athlete, boxA, "ATHLETE");
        athleteToken = tokenService.boxToken(athlete, athleteMembership);

        // Box A's own admin — used ONLY by the positive control for probe (b).
        User owner = authService.register("sweep-own-" + n + "@t.io", "correct-horse-battery", "Sweep Owner A");
        Membership ownerMembership = member(owner, boxA, "BOX_ADMIN");
        ownerToken = tokenService.boxToken(owner, ownerMembership);

        User foreignAdmin = authService.register("sweep-adm-" + n + "@t.io", "correct-horse-battery", "Sweep Admin B");
        foreignBoxToken = tokenService.boxToken(foreignAdmin, member(foreignAdmin, boxB, "BOX_ADMIN"));
        foreignUserToken = tokenService.userToken(foreignAdmin);

        actAsBox(boxA.getId(), athlete.getId()); // InviteService stamps created_by from the JWT subject

        // M29a. Created INSIDE the actAsBox block: Announcement and AnnouncementRecipient are both
        // @TenantId, and a tenant-less write stamps the all-zeros sentinel and dies on the FK
        // (docs/TENANCY.md failure mode 2). The body carries `mark`, so probe (d) can prove box B
        // never sees it. Recipient rows for BOTH box-A members: the athlete because the collection
        // GET must have something to leak if it is broken, and the owner-admin because the positive
        // control re-issues denied probes with that token and requires a non-404.
        com.boxhub.box.Announcement announcement = new com.boxhub.box.Announcement();
        announcement.setBody("Announcement " + mark);
        announcement.setSegment("EVERYONE");
        announcement.setSentAt(Instant.now());
        // Sent BY the owner-admin, because GET /api/box/announcements/{id}/recipients is readable
        // only by whoever sent it. Left unset, the positive control re-issues that probe with the
        // owner token and gets a legitimate 403, which the sweep cannot tell from a broken route.
        announcement.setSentBy(owner.getId());
        boxAnnouncementId = announcements.save(announcement).getId();
        for (UUID mid : List.of(athleteMembership.getId(), ownerMembership.getId())) {
            com.boxhub.box.AnnouncementRecipient rec = new com.boxhub.box.AnnouncementRecipient();
            rec.setAnnouncementId(boxAnnouncementId);
            rec.setMembershipId(mid);
            announcementRecipients.save(rec);
        }

        // M29b. {id} in /api/box/notifications/{id}/read resolves off the preceding segment.
        //
        // Owned by ownerMembership, NOT the athlete: that handler resolves {id} against the
        // CALLER's own membership, and the positive control re-issues every denied probe with box
        // A's OWN ADMIN token and requires a non-404. Seeded against the athlete it 404s for the
        // admin, and the sweep reports the foreign-box probe as proving nothing — which is exactly
        // what it did the first time. (The announcement fixture above sidesteps this by writing a
        // recipient row for BOTH memberships; a notification is one row for one member, so the
        // owner is the one that has to hold it.)
        //
        // Seeded inside the actAsBox window above so @TenantId stamps box A rather than the
        // NO_TENANT sentinel. Deliberately NOT a NEW_ANNOUNCEMENT: that type delegates its read
        // state to announcement_recipient and leaves read_at null, so it would exercise a
        // different branch of markRead than this probe is aimed at.
        com.boxhub.notify.Notification sweepNotification = new com.boxhub.notify.Notification();
        sweepNotification.setMembershipId(ownerMembership.getId());
        sweepNotification.setType(com.boxhub.notify.NotificationType.WAITLIST_PROMOTED.name());
        sweepNotification.setParams(java.util.Map.of("className", "Sweep " + mark));
        boxANotificationId = notifications.save(sweepNotification).getId();

        Plan plan = new Plan();
        plan.setName("Plan " + mark);
        plan.setPriceCents(5000);
        plan = plans.save(plan);

        Subscription sub = new Subscription();
        sub.setMembershipId(athleteMembership.getId());
        sub.setPlanId(plan.getId());
        sub.setStatus("ACTIVE");
        sub.setPriceCents(5000);
        sub.setCurrentPeriodEnd(Instant.now().plusSeconds(86_400));
        sub.setPriceNote(mark);
        sub = subscriptions.save(sub);

        Payment payment = new Payment();
        payment.setSubscriptionId(sub.getId());
        payment.setAmountCents(5000);
        payment.setCurrency("eur");
        payment.setMethod("CASH");
        payment.setStatus("SUCCEEDED");
        payment.setReference(mark);
        payment = payments.save(payment);

        InviteService.CreatedInvite invite = inviteService.create(mark.toLowerCase() + "@t.io", "ATHLETE", null);

        // M14a: class_templates split into class_type (identity) x schedule_slot (when it runs).
        // The /api/box/class-templates resource id is the SLOT id, so `template` stays a slot and
        // every pathIds entry below is unchanged.
        ClassType classType = new ClassType();
        classType.setName("Template " + mark);
        classType = classTypes.save(classType);

        ScheduleSlot template = new ScheduleSlot();
        template.setClassTypeId(classType.getId());
        template.setWeekday(1);
        template.setStartTime(LocalTime.of(10, 0));
        template.setDurationMin(60);
        template.setCapacity(12);
        template = slots.save(template);

        ClassSession session = new ClassSession();
        session.setName("Session " + mark);
        session.setStartAt(Instant.now().plusSeconds(3600));
        session.setDurationMin(60);
        session.setCapacity(12);
        session = sessions.save(session);

        // DELETE /api/box/sessions/{id}/booking cancels the CALLER'S OWN booking, so without this
        // row box A's own admin 404s there too — the positive control caught exactly that, and it
        // means the foreign probe's 404 would have been "no booking of mine", not "not your box".
        // Booking is @TenantId, so this stays invisible to box B.
        Booking booking = new Booking();
        booking.setSessionId(session.getId());
        booking.setMembershipId(ownerMembership.getId());
        booking.setStatus("BOOKED");
        bookings.save(booking);

        Wod wod = new Wod();
        wod.setTitle("Wod " + mark);
        wod.setMacro("WORKOUT");
        wod.setTimingPreset("FOR_TIME");
        wod.setScoreType("TIME");
        wod.setBodyText(mark);
        wod = wods.save(wod);

        SessionItem item = new SessionItem();
        item.setSessionId(session.getId());
        item.setWodId(wod.getId());
        item.setSortOrder(0);
        item.setScoreable(true);
        item.setScoreType("TIME");
        item = items.save(item);

        Movement movement = new Movement();
        movement.setBoxId(boxA.getId());
        movement.setName("Movement " + mark);
        movement.setCategory("BARBELL");
        movement = movements.save(movement);

        // GET /api/box/lifts needs a movementId AND a box-A row to leak, or its collection-leak
        // assertion is true for the wrong reason (an empty result set).
        LiftEntry lift = new LiftEntry();
        lift.setMembershipId(athleteMembership.getId());
        lift.setMovementId(movement.getId());
        lift.setLoad(new java.math.BigDecimal("100"));
        lift.setReps(1);
        lift.setPerformedOn(java.time.LocalDate.now());
        lift.setNotes(mark);
        lift = lifts.save(lift);

        // DELETE /api/auth/sessions/{familyId}: a real family belonging to box-A's athlete, so the
        // self probe (foreignUserToken, a DIFFERENT user) has an id that exists but is not theirs —
        // exactly the case that must 404, not 403 or 204.
        String rawRefresh = refreshTokens.issue(athlete, "sweep-ua", "9.9.9.9");
        UUID athleteFamilyId = refreshTokenRepo.findByTokenHash(RefreshTokenService.sha256(rawRefresh))
                .orElseThrow().getFamilyId();

        TvDevice tv = new TvDevice();
        tv.setBoxId(boxA.getId());
        tv.setName("Tv " + mark);
        tv.setSecretHash("x");
        tv.setStatus("ACTIVE");
        tv = tvDevices.save(tv);

        SecurityContextHolder.clearContext();

        pathIds.clear();
        // by path-variable name
        pathIds.put("membershipId", athleteMembership.getId().toString());
        pathIds.put("paymentId", payment.getId().toString());
        pathIds.put("sessionId", session.getId().toString());
        pathIds.put("templateId", template.getId().toString());
        pathIds.put("itemId", item.getId().toString());
        pathIds.put("token", invite.rawToken());
        pathIds.put("familyId", athleteFamilyId.toString());
        // by preceding path segment, for a bare {id}
        pathIds.put("boxes", boxA.getId().toString());
        pathIds.put("subscriptions", sub.getId().toString());
        pathIds.put("plans", plan.getId().toString());
        pathIds.put("invites", invite.invite().getId().toString());
        pathIds.put("class-templates", template.getId().toString());
        pathIds.put("sessions", session.getId().toString());
        pathIds.put("wods", wod.getId().toString());
        pathIds.put("movements", movement.getId().toString());
        pathIds.put("tv", tv.getId().toString());
        // BenchmarkTemplate is a GLOBAL catalog row, not a box-A resource — see SKIP_FOREIGN.
        pathIds.put("benchmarks", benchmarks.findAll().getFirst().getId().toString());
        // M29a. {id} in /api/box/me/announcements/{id}/read resolves off the preceding segment.
        // The recipient row is NOT optional: the positive control re-issues every denied probe with
        // box A's OWN admin token and requires a non-404, and that handler resolves the row by
        // (my membership, announcement) — with no row, the control would fail on a correct handler.
        pathIds.put("announcements", boxAnnouncementId.toString());
        // M29b. No other route puts a different id type after a "notifications" segment.
        pathIds.put("notifications", boxANotificationId.toString());

        adminIds.clear();
        adminIds.put("boxes", boxC.getId().toString());

        markers.clear();
        markers.add(mark);
        markers.add(athlete.getEmail());
        markers.addAll(List.of(boxA.getId(), athleteMembership.getId(), plan.getId(), sub.getId(),
                        payment.getId(), invite.invite().getId(), template.getId(), session.getId(),
                        wod.getId(), item.getId(), movement.getId(), tv.getId(), lift.getId())
                .stream().map(UUID::toString).toList());

        // Both request-shaping maps are built HERE, from seeded ids, and nowhere else: a static map
        // plus a "%s" placeholder plus a factory method was three ways to say the same thing.
        query = Map.of(
                "GET /api/box/sessions", "?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z",
                "GET /api/box/my-bookings", "?from=2020-01-01T00:00:00Z",
                "GET /api/box/lifts", "?movementId=" + movement.getId(),
                // EVERYONE needs no seeded id. Without this entry the athlete probe 400s on the
                // missing param before RoleGuard.requireStaff() runs, so the route would be swept
                // without its role check ever being exercised.
                "GET /api/box/announcements/preview", "?segment=EVERYONE");

        bodies = Map.ofEntries(
                Map.entry("PUT /api/box/stripe", "{\"restrictedKey\":\"rk_test_x\",\"webhookSecret\":\"whsec_x\"}"),
                Map.entry("POST /api/box/plans", "{\"name\":\"P\",\"durationDays\":30,\"priceCents\":100}"),
                Map.entry("POST /api/box/invites", "{\"email\":\"probe@t.io\",\"role\":\"ATHLETE\"}"),
                Map.entry("POST /api/box/movements", "{\"name\":\"M\",\"category\":\"BARBELL\"}"),
                Map.entry("PUT /api/box/sessions/{sessionId}/items", "{\"items\":[]}"),
                Map.entry("PATCH /api/box/sessions/{sessionId}/programming", "{\"status\":\"PUBLISHED\"}"),
                Map.entry("PUT /api/box/class-templates/{templateId}/skeleton", "{\"pieces\":[]}"),
                Map.entry("POST /api/box/class-templates",
                        "{\"name\":\"T\",\"weekday\":1,\"startTime\":\"10:00\",\"durationMin\":60,\"capacity\":10}"),
                // Both fields are @NotBlank: without a valid body the probe 400s on validation
                // before RoleGuard runs, which proves nothing about who may send.
                Map.entry("POST /api/box/announcements", "{\"body\":\"probe\",\"segment\":\"EVERYONE\"}"),
                // M29a. Without these the probe's `{}` is rejected by @NotBlank with a 400 BEFORE
                // RoleGuard.requireStaff() runs, and the sweep reported exactly that: "400 means
                // validation ran before authz". With a valid body the probe reaches the guard, so
                // the 403 it now asserts is real evidence the route is staff-only.
                Map.entry("POST /api/box/conversations/{membershipId}/messages", "{\"body\":\"probe\"}"),
                Map.entry("POST /api/box/wods", "{\"title\":\"W\",\"wodType\":\"FOR_TIME\",\"scoreType\":\"TIME\"}"),
                Map.entry("PUT /api/box/me/avatar", "{\"path\":\"media/x.png\"}"),
                // M29b. The body takes a LIST; without one the probe 400s on deserialization
                // before RoleGuard runs, and a 400 proves nothing about who may send. CLASS_CANCELLED
                // is deliberately a non-mandatory type — a mandatory one is refused 409 by the
                // handler itself, which would mask the authz result the same way.
                Map.entry("PUT /api/box/me/notification-prefs",
                        "[{\"type\":\"CLASS_CANCELLED\",\"channel\":\"IN_APP\",\"enabled\":false}]"),
                Map.entry("POST /api/box/subscriptions/checkout", "{\"planId\":\"" + plan.getId() + "\"}"),
                Map.entry("POST /api/box/lifts", "{\"movementId\":\"" + movement.getId() + "\",\"load\":100}"),
                // The one non-box route that names a tenant: box A's id, so a caller with no box-A
                // membership must be refused a box-A token.
                Map.entry("POST /api/auth/box-token", "{\"boxId\":\"" + boxA.getId() + "\"}"),
                // Same password in and out, deliberately: the probe must reach the handler without
                // changing the fixture user's credentials, or the /api/me/email probe that runs
                // after it (routes are walked in sorted order) would fail on WRONG_PASSWORD.
                Map.entry("PATCH /api/me/password",
                        "{\"currentPassword\":\"correct-horse-battery\",\"newPassword\":\"correct-horse-battery\"}"),
                Map.entry("POST /api/me/email",
                        "{\"password\":\"correct-horse-battery\",\"newEmail\":\"probe-new@t.io\"}"));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setStatus("ACTIVE");
        return boxes.save(b);
    }

    private Membership member(User u, Box box, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        return memberships.save(m);
    }

    // ---------------------------------------------------------------- declarations

    /** Deliberately reachable without box scoping. Keyed by METHOD + pattern, NOT pattern alone:
     *  SecurityConfig permits /api/invites/* for GET only, so a later DELETE on the same pattern
     *  must not inherit the exemption. EVERY entry needs a justification comment. */
    private static final Set<String> PUBLIC_ALLOWLIST = Set.of(
            "POST /api/auth/register", "POST /api/auth/login", "POST /api/auth/refresh",
            "GET /api/auth/csrf", "GET /api/auth/providers", "POST /api/auth/verify",
            "POST /api/auth/verify/resend", "POST /api/auth/password/forgot",
            "POST /api/auth/password/reset", "POST /api/auth/signup-box", "POST /api/auth/waitlist",
            "GET /api/auth/signup-mode",
            "POST /api/auth/logout",           // clears the cookie; must work with no/expired creds
            "POST /api/me/email/confirm",      // token in the emailed link IS the credential
            "GET /api/invites/{token}",        // public invite preview, unguessable token
            "POST /api/tv/pair", "POST /api/tv/pair/poll", // device pairing, pre-identity
            "GET /api/tv/stream",              // NOT pre-identity: carries a long-lived device token
                                               // in the httpOnly bh_tv cookie (Path=/api/tv, set at
                                               // pair-claim), verified in TvStreamController — which
                                               // 401s with no cookie and rejects a REVOKED device.
                                               // M11 T5 moved it off the query string so it stops
                                               // landing in nginx logs and browser history.
            "POST /api/stripe/webhook");       // Stripe signature IS the credential

    /**
     * Minimum role per box-scoped route. A route missing here FAILS — state intent explicitly.
     * Roles are NOT inferable: RoleGuard is imperative, inside method bodies, so every value below
     * was read off the controller. ATHLETE = any active member of the box (no RoleGuard call);
     * COACH = RoleGuard.requireStaff(); BOX_ADMIN = RoleGuard.requireBoxAdmin().
     */
    private static final Map<String, String> MIN_ROLE = Map.ofEntries(
            // --- memberships & payments (M10) ---
            Map.entry("POST /api/box/subscriptions", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/subscriptions/{id}", "BOX_ADMIN"),
            Map.entry("POST /api/box/subscriptions/checkout", "ATHLETE"),
            Map.entry("GET /api/box/me/subscription", "ATHLETE"),
            Map.entry("GET /api/box/receipts/{paymentId}", "ATHLETE"), // + per-row payer/admin check
            Map.entry("GET /api/box/plans", "ATHLETE"),
            Map.entry("POST /api/box/plans", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/plans/{id}", "BOX_ADMIN"),
            Map.entry("GET /api/box/stripe", "BOX_ADMIN"),
            Map.entry("PUT /api/box/stripe", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/stripe", "BOX_ADMIN"),
            // --- box admin surface ---
            Map.entry("GET /api/box/admin-stats", "BOX_ADMIN"),
            Map.entry("GET /api/box/current", "ATHLETE"),
            Map.entry("PATCH /api/box/settings", "BOX_ADMIN"),
            Map.entry("GET /api/box/members", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/members/{membershipId}", "BOX_ADMIN"),
            Map.entry("GET /api/box/members/{membershipId}/profile", "ATHLETE"),
            Map.entry("POST /api/box/invites", "BOX_ADMIN"),
            Map.entry("GET /api/box/invites", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/invites/{id}", "BOX_ADMIN"),
            // --- announcements & class types ---
            // M29a retired the singular /api/box/announcement (one overwritten row per box) in
            // favour of append-only sends with a frozen audience. Staff send and read history;
            // a member reads only what was addressed to them.
            Map.entry("POST /api/box/announcements", "COACH"),
            Map.entry("GET /api/box/announcements", "COACH"),
            Map.entry("GET /api/box/announcements/targets", "COACH"),
            Map.entry("GET /api/box/announcements/preview", "COACH"),
            Map.entry("GET /api/box/announcements/{id}/recipients", "COACH"),
            Map.entry("GET /api/box/me/announcements", "ATHLETE"),
            Map.entry("POST /api/box/me/announcements/{id}/read", "ATHLETE"),
            Map.entry("GET /api/box/class-templates", "ATHLETE"),
            Map.entry("POST /api/box/class-templates", "COACH"),
            Map.entry("PATCH /api/box/class-templates/{id}", "COACH"),
            Map.entry("GET /api/box/class-templates/{templateId}/skeleton", "COACH"),
            Map.entry("PUT /api/box/class-templates/{templateId}/skeleton", "COACH"),
            // --- schedule, booking, roster ---
            Map.entry("GET /api/box/home", "ATHLETE"),
            // --- M29a AMENDMENT A1: person-to-person conversations. These five REPLACE the seven
            // retired /api/box/me/thread** and /api/box/threads** routes (shared box thread, D-1
            // and D-3, superseded).
            //
            // All five are ATHLETE because the ROLE gate genuinely no longer distinguishes: an
            // athlete may legitimately open a conversation with a coach, so the same route serves
            // both. Who may address whom is not a role check — it is a per-PAIR rule, and it lives
            // in MessagingService.assertMayMessage (athletes may address staff only; staff may
            // address anyone in the box).
            //
            // Be aware what that costs this sweep, so nobody reads the ATHLETE below as slack:
            // declaring a route ATHLETE means probe (c) — an ATHLETE token expecting 403 — does not
            // run against it. That coverage did not vanish, it MOVED: ConversationApiTest carries a
            // cross-member-denied test per endpoint, of which athleteCannotMessageAnotherAthlete is
            // the load-bearing one. It was proved by negative control (disable the rule, watch it
            // and two siblings go red). Probes (a) anonymous -> 401 and (b) foreign-tenant -> 403
            // still run here, and (b) passes precisely because assertMayMessage resolves the target
            // with findByIdAndBoxId rather than a bare findById.
            Map.entry("GET /api/box/contacts", "ATHLETE"),
            // M29b: the member's own feed. Member-level — any ACTIVE member of the box.
            Map.entry("GET /api/box/notifications", "ATHLETE"),
            Map.entry("GET /api/box/notifications/unread-count", "ATHLETE"),
            Map.entry("POST /api/box/notifications/{id}/read", "ATHLETE"),
            Map.entry("POST /api/box/notifications/read-all", "ATHLETE"),
            Map.entry("GET /api/box/me/notification-prefs", "ATHLETE"),
            Map.entry("PUT /api/box/me/notification-prefs", "ATHLETE"),
            Map.entry("GET /api/box/conversations", "ATHLETE"),
            Map.entry("GET /api/box/conversations/{membershipId}", "ATHLETE"),
            Map.entry("POST /api/box/conversations/{membershipId}/messages", "ATHLETE"),
            Map.entry("POST /api/box/conversations/{membershipId}/read", "ATHLETE"),
            Map.entry("GET /api/box/sessions", "ATHLETE"),
            Map.entry("PATCH /api/box/sessions/{id}", "COACH"),
            Map.entry("GET /api/box/sessions/{id}/detail", "ATHLETE"),
            Map.entry("POST /api/box/sessions/{id}/book", "ATHLETE"),
            Map.entry("DELETE /api/box/sessions/{id}/booking", "ATHLETE"),
            Map.entry("GET /api/box/my-bookings", "ATHLETE"),
            Map.entry("GET /api/box/sessions/{id}/roster", "COACH"),
            Map.entry("POST /api/box/sessions/{id}/checkin", "COACH"),
            Map.entry("POST /api/box/sessions/{id}/uncheck", "COACH"),
            Map.entry("POST /api/box/sessions/{id}/no-show", "COACH"),
            Map.entry("GET /api/box/sessions/{sessionId}/timer", "COACH"),
            Map.entry("POST /api/box/sessions/{sessionId}/timer", "COACH"),
            // --- programming ---
            Map.entry("GET /api/box/sessions/{sessionId}/items", "ATHLETE"),
            Map.entry("PUT /api/box/sessions/{sessionId}/items", "COACH"),
            Map.entry("PATCH /api/box/sessions/{sessionId}/programming", "COACH"),
            Map.entry("GET /api/box/wods", "ATHLETE"),
            Map.entry("GET /api/box/wods/{id}", "ATHLETE"),
            Map.entry("GET /api/box/wods/history", "COACH"),
            Map.entry("POST /api/box/wods", "COACH"),
            Map.entry("PATCH /api/box/wods/{id}", "COACH"),
            Map.entry("DELETE /api/box/wods/{id}", "COACH"),
            Map.entry("POST /api/box/wods/{id}/duplicate", "COACH"),
            Map.entry("GET /api/box/movements", "ATHLETE"),
            Map.entry("POST /api/box/movements", "COACH"),
            Map.entry("PATCH /api/box/movements/{id}", "BOX_ADMIN"),
            Map.entry("GET /api/box/benchmarks", "ATHLETE"),
            Map.entry("GET /api/box/benchmarks/{id}", "ATHLETE"),
            Map.entry("POST /api/box/benchmarks/{id}/clone", "COACH"),
            Map.entry("GET /api/box/my-class-today", "ATHLETE"),
            // --- performance ---
            Map.entry("PUT /api/box/sessions/items/{itemId}/score", "ATHLETE"),
            Map.entry("GET /api/box/sessions/items/{itemId}/score", "ATHLETE"),
            Map.entry("POST /api/box/sessions/items/{itemId}/score/{membershipId}", "COACH"),
            // M14c-a. ATHLETE + a per-row check in the handler: the caller must be one of the named
            // members, or staff. Same shape as GET /api/box/receipts/{paymentId}.
            Map.entry("POST /api/box/sessions/items/{itemId}/score/team", "ATHLETE"),
            Map.entry("GET /api/box/sessions/items/{itemId}/leaderboard", "ATHLETE"),
            Map.entry("GET /api/box/my-scores", "ATHLETE"),
            Map.entry("GET /api/box/benchmark-history", "ATHLETE"),
            Map.entry("POST /api/box/lifts", "ATHLETE"),
            Map.entry("GET /api/box/lifts", "ATHLETE"),
            Map.entry("GET /api/box/lifts/prs", "ATHLETE"),
            // --- profile, media, TV ---
            Map.entry("GET /api/box/me/profile", "ATHLETE"),
            Map.entry("PATCH /api/box/me/profile", "ATHLETE"),
            Map.entry("PUT /api/box/me/avatar", "ATHLETE"),
            Map.entry("POST /api/box/media", "ATHLETE"),
            Map.entry("POST /api/box/tv/claim", "COACH"),
            Map.entry("GET /api/box/tv", "COACH"),
            Map.entry("PATCH /api/box/tv/{id}", "COACH"),
            Map.entry("DELETE /api/box/tv/{id}", "COACH"));

    /**
     * Every authenticated route OUTSIDE /api/box/**. SUPERADMIN = a BOX_ADMIN box token must be
     * rejected. SELF = the route serves the calling user only, so another user's token must not
     * surface box-A data.
     */
    private static final Map<String, String> NON_BOX_SCOPE = Map.ofEntries(
            Map.entry("GET /api/admin/boxes", "SUPERADMIN"),
            Map.entry("POST /api/admin/boxes", "SUPERADMIN"),
            Map.entry("POST /api/admin/boxes/{id}/approve", "SUPERADMIN"),
            Map.entry("POST /api/admin/boxes/{id}/reject", "SUPERADMIN"),
            Map.entry("POST /api/admin/boxes/{id}/suspend", "SUPERADMIN"),
            Map.entry("POST /api/admin/boxes/{id}/reactivate", "SUPERADMIN"),
            Map.entry("GET /api/admin/waitlist", "SUPERADMIN"),
            Map.entry("GET /api/admin/settings", "SUPERADMIN"),
            Map.entry("PATCH /api/admin/settings", "SUPERADMIN"),
            Map.entry("GET /api/admin/audit", "SUPERADMIN"),
            Map.entry("GET /api/me", "SELF"),
            Map.entry("DELETE /api/me", "SELF"),
            Map.entry("GET /api/me/export", "SELF"),
            Map.entry("PATCH /api/me/password", "SELF"),
            Map.entry("POST /api/me/email", "SELF"),
            Map.entry("GET /api/auth/sessions", "SELF"),
            Map.entry("DELETE /api/auth/sessions/{familyId}", "SELF"),
            Map.entry("POST /api/auth/logout-all", "SELF"),
            Map.entry("POST /api/auth/box-token", "SELF"),
            Map.entry("POST /api/invites/{token}/accept", "SELF"));

    /**
     * Per-ASSERTION suppression (never per-route: a suppressed foreign probe must not also silence
     * the anonymous probe). Ideally empty; every entry needs a justification.
     */
    private static final Set<String> SKIP_FOREIGN = Set.of(
            // BenchmarkTemplate is a GLOBAL read-only catalog (girls + heroes), deliberately not
            // @TenantId. Box B reading or cloning one is correct, not a tenancy break.
            "GET /api/box/benchmarks/{id}",
            "POST /api/box/benchmarks/{id}/clone");

    private static final Set<String> SKIP_SELF = Set.of(
            // Holding the raw invite token IS the authorization — a user from any box is MEANT to
            // be able to accept it. Probing it would also burn the fixture's invite.
            "POST /api/invites/{token}/accept",
            // Destructive and self-targeting by construction: an empty body binds, so the probe
            // would anonymize the fixture's foreign user and poison every later assertion.
            "DELETE /api/me");

    /**
     * Floor per probe family. The census used to be PRINTED, which meant an accidental early
     * {@code continue}, a narrowed filter or a broken {@code bodies} entry could silently drop
     * assertions and leave the sweep green. Asserting the floors makes "204 assertions" a checked
     * invariant. Raise a floor when a family legitimately grows; never lower one to go green.
     */
    private static final Map<String, Integer> MIN_PROBES = Map.of(
            "anonymous", 92, "foreign-box", 33, "positive-control", 33,
            "insufficient-role", 41, "collection-leak", 22, "superadmin", 9, "self", 7);

    /**
     * Query string per route whose required {@code @RequestParam} would otherwise 400 before the
     * handler runs. Built in {@link #fixture()} because {@code GET /api/box/lifts} needs a seeded
     * box-A movement id. A missing entry is no longer silent: probe (d) fails any non-2xx.
     */
    private Map<String, String> query;

    /**
     * Minimal VALID body per route that has a @Valid @RequestBody. Without these the probe's `{}`
     * is rejected by the validator with a 400 BEFORE the handler's RoleGuard/tenant check runs, so
     * the assertion could not tell a guarded route from an unguarded one. With a well-formed body
     * the probe reaches the authz check and a failure here is a REAL hole. Built in {@link #fixture()}
     * — several bodies carry seeded box-A ids.
     */
    private Map<String, String> bodies;

    // ---------------------------------------------------------------- route table

    private record Route(String method, String pattern) {
        String key() { return method + " " + pattern; }
    }

    private List<Route> routes() {
        List<Route> out = new ArrayList<>();
        mapping.getHandlerMethods().forEach((info, handler) -> {
            var patterns = info.getPathPatternsCondition() != null
                    ? info.getPathPatternsCondition().getPatternValues()
                    : Set.<String>of();
            var methods = info.getMethodsCondition().getMethods();
            for (String p : patterns) {
                // Deliberate scope: only /api/**. Actuator (/actuator/**, and any
                // @RestControllerEndpoint) lives on a DIFFERENT handler mapping — see the
                // @Qualifier on `mapping` — and is guarded by SecurityConfig + management port
                // config, not by tenancy. Nothing there is box-scoped, so there is no tenancy
                // assertion to make; if a box-scoped actuator endpoint is ever added it belongs
                // under /api/ (or this sweep needs a second mapping).
                if (!p.startsWith("/api/")) continue;
                // A @RequestMapping with no method= answers EVERY verb. We probe it as GET only —
                // if such a mapping is ever added, its other verbs are NOT covered here. Today
                // every mapping declares its verb, so this branch is unreachable in practice.
                if (methods.isEmpty()) out.add(new Route("GET", p));
                else methods.forEach(m -> out.add(new Route(m.name(), p)));
            }
        });
        out.sort(Comparator.comparing(Route::key));
        return out;
    }

    /**
     * Substitutes REAL box-A ids for path variables. Resolution is by variable name first, then by
     * the preceding path segment (for a bare {id}). An unresolvable variable is a HARD FAILURE:
     * falling back to a random UUID is exactly the defect that made the first version of this sweep
     * unable to distinguish a tenant-scoped handler from an unscoped one.
     */
    private String concrete(String pattern) {
        // /api/admin/** resolves against a THROWAWAY box, never box A: those probes assert only the
        // 403, and pointing {id} at box A let `POST /api/admin/boxes/{id}/suspend` mutate the
        // fixture mid-sweep. An admin path variable with no entry here is still a hard failure.
        Map<String, String> ids = pattern.startsWith("/api/admin/") ? adminIds : pathIds;
        String[] segs = pattern.split("/", -1);
        for (int i = 0; i < segs.length; i++) {
            if (!segs[i].startsWith("{")) continue;
            String var = segs[i].substring(1, segs[i].length() - 1);
            String id = ids.get(var);
            if (id == null && i > 0) id = ids.get(segs[i - 1]);
            if (id == null) throw new AssertionError(
                    "No seeded box-A resource for path variable {" + var + "} in " + pattern
                    + ". Seed one in fixture() and register it in pathIds — the sweep must never "
                    + "substitute a random UUID, or the foreign-box probe stops testing tenancy.");
            segs[i] = id;
        }
        return String.join("/", segs);
    }

    private MockHttpServletRequestBuilder req(Route r) {
        var b = request(HttpMethod.valueOf(r.method()), concrete(r.pattern()) + query.getOrDefault(r.key(), ""))
                .contentType(APPLICATION_JSON).content(bodies.getOrDefault(r.key(), "{}"));
        // A write with no Authorization header hits the CSRF filter first and 403s, hiding the
        // 401 we are actually testing. Same reason SuperadminBoxApiTest uses .with(csrf()).
        return "GET".equals(r.method()) ? b : b.with(csrf());
    }

    private record Result(int status, String body) {}

    private Result call(Route r, String token) throws Exception {
        var res = (token == null ? mvc.perform(req(r))
                                 : mvc.perform(req(r).header("Authorization", "Bearer " + token)))
                .andReturn().getResponse();
        return new Result(res.getStatus(), res.getContentAsString());
    }

    private String leaked(String body) {
        return markers.stream().filter(body::contains).findFirst().orElse(null);
    }

    // ---------------------------------------------------------------- the sweep

    @Test
    void everyRouteDeniesAnonymousForeignTenantAndInsufficientRole() throws Exception {
        List<String> failures = new ArrayList<>();
        List<String> unlisted = new ArrayList<>();
        Map<String, Integer> probes = new TreeMap<>();
        List<Route> positives = new ArrayList<>();

        for (Route r : routes()) {
            if (PUBLIC_ALLOWLIST.contains(r.key())) continue;

            // (a) no credentials
            int anon = call(r, null).status();
            if (anon != 401) failures.add(r.key() + " anonymous -> " + anon + " (want 401)");
            probes.merge("anonymous", 1, Integer::sum);

            if (r.pattern().startsWith("/api/box/")) {
                String need = MIN_ROLE.get(r.key());
                if (need == null) { unlisted.add(r.key()); continue; }

                // (b) foreign box: box B's admin, REAL box-A id, valid body.
                if (r.pattern().contains("{") && !SKIP_FOREIGN.contains(r.key())) {
                    int foreign = call(r, foreignBoxToken).status();
                    if (foreign != 403 && foreign != 404)
                        failures.add(r.key() + " foreign-box on a REAL box-A id -> " + foreign
                                + " (want 403/404" + (foreign == 400 ? "; 400 means validation ran before authz" : "")
                                + ")");
                    probes.merge("foreign-box", 1, Integer::sum);
                    positives.add(r); // (b+) — asserted in a second pass, see below
                }

                // (c) insufficient role: anything stricter than ATHLETE must reject an athlete.
                if (!"ATHLETE".equals(need)) {
                    int athlete = call(r, athleteToken).status();
                    if (athlete != 403)
                        failures.add(r.key() + " athlete-on-" + need + "-route -> " + athlete + " (want 403)");
                    probes.merge("insufficient-role", 1, Integer::sum);
                }

                // (d) collection leak: box B must REACH the collection (2xx) and see ZERO box-A rows.
                if ("GET".equals(r.method()) && !r.pattern().contains("{")) {
                    Result res = call(r, foreignBoxToken);
                    // A non-2xx body carries no box-A marker either, so without this the leak
                    // assertion below passes VACUOUSLY — the route would be counted as covered
                    // while proving nothing. Default-deny applies to the probe itself.
                    if (res.status() / 100 != 2)
                        failures.add(r.key() + " collection-leak probe: box B got " + res.status()
                                + " and never reached the collection, so the leak assertion proved"
                                + " NOTHING" + (res.status() == 400
                                        ? " (400 — a required @RequestParam is missing from `query`)" : "")
                                + ". Make the probe reach 2xx, or state why box B legitimately cannot.");
                    String hit = leaked(res.body());
                    if (hit != null)
                        failures.add(r.key() + " leaked a box-A value to box B: " + hit);
                    probes.merge("collection-leak", 1, Integer::sum);
                }
                continue;
            }

            String scope = NON_BOX_SCOPE.get(r.key());
            if (scope == null) { unlisted.add(r.key()); continue; }

            // (e) superadmin surface: a BOX_ADMIN box token must not escalate.
            if ("SUPERADMIN".equals(scope)) {
                int boxAdmin = call(r, foreignBoxToken).status();
                if (boxAdmin != 403)
                    failures.add(r.key() + " box-admin-on-superadmin-route -> " + boxAdmin + " (want 403)");
                probes.merge("superadmin", 1, Integer::sum);
            }

            // (f) self surface: another user's token must not reach box-A / user-A data.
            if ("SELF".equals(scope) && !SKIP_SELF.contains(r.key())) {
                Result res = call(r, foreignUserToken);
                String hit = leaked(res.body());
                if (hit != null)
                    failures.add(r.key() + " leaked a box-A value to a different user: " + hit);
                // The one non-box route that names a tenant in its body: a user with no membership
                // in box A must not be minted a box-A token.
                if ("POST /api/auth/box-token".equals(r.key()) && res.status() < 400)
                    failures.add(r.key() + " minted a token for a box the caller does not belong to -> "
                            + res.status() + " (want 4xx)");
                probes.merge("self", 1, Integer::sum);
            }
        }

        // (b+) positive control, LAST and with DELETEs last within it. Every url probe (b) denied
        // must be reachable by box A's own admin — otherwise the denial only re-proved "unknown id
        // -> not 2xx". These carry the same valid bodies, so they genuinely mutate; running them
        // inline would poison the fixture the other probes read.
        positives.sort(Comparator.comparing((Route r) -> "DELETE".equals(r.method())).thenComparing(Route::key));
        for (Route r : positives) {
            probes.merge("positive-control", 1, Integer::sum);
            try {
                if (call(r, ownerToken).status() == 404)
                    failures.add(r.key() + " positive control: box A's OWN admin got 404 on the seeded id."
                            + " The foreign-box probe on this route therefore proves nothing — the row is"
                            + " unreachable for everyone (fixture drift, or {id} resolved to the wrong type).");
            } catch (Exception reached) {
                // The request reached the handler and blew up on the probe's throwaway body — e.g.
                // POST /api/box/sessions/{id}/checkin with no bookingId. Reachability is the ONLY
                // claim this control makes, and an absent row surfaces as a handled 404 (mapped from
                // NoSuchElementException), never as a thrown exception, so this cannot hide a 404.
            }
        }

        SoftAssertions.assertSoftly(s -> {
            s.assertThat(failures).as("Authz conformance failures").isEmpty();
            s.assertThat(unlisted)
                    .as("Routes with no declared expectation. Add each to MIN_ROLE / NON_BOX_SCOPE "
                        + "with its real intent, or to PUBLIC_ALLOWLIST with a justification.")
                    .isEmpty();
            // The census is ASSERTED, not merely printed: a silently shrinking probe family is the
            // quietest way for this guarantee to rot.
            MIN_PROBES.forEach((family, floor) -> s.assertThat(probes.getOrDefault(family, 0))
                    .as("probe count for '" + family + "' — assertions were lost, not added")
                    .isGreaterThanOrEqualTo(floor));
        });
        System.out.println("[authz-sweep] routes=" + routes().size()
                + " allowlisted=" + PUBLIC_ALLOWLIST.size() + " probes=" + probes
                + " total=" + probes.values().stream().mapToInt(Integer::intValue).sum());
    }
}
