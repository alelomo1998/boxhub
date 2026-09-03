package com.boxhub.notify;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The GET returns EFFECTIVE state, never stored rows (notification_pref is sparse by design).
 * A mandatory type is refused, not silently ignored; an undeliverable channel is refused too;
 * types with no in-app delivery are not offered at all.
 */
class NotificationPrefApiTest extends AbstractIntegrationTest {

    @Autowired NotificationPrefController controller;
    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    Box box, otherBox;
    Membership athlete, foreignAdmin;
    String athleteToken, foreignAdminToken;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        box = newBox("Prefs " + n, "prefs-" + n);
        otherBox = newBox("ForeignPrefs " + n, "fprefs-" + n);

        User ua = authService.register("pa-" + n + "@t.io", "correct-horse-battery", "Ada");
        User uf = authService.register("pf-" + n + "@t.io", "correct-horse-battery", "Foreign");

        athlete = member(ua, box, "ATHLETE");
        foreignAdmin = member(uf, otherBox, "BOX_ADMIN");

        athleteToken = tokenService.boxToken(ua, athlete);
        foreignAdminToken = tokenService.boxToken(uf, foreignAdmin);
    }

    /** Direct-controller calls need TenantContext.userId() AND requireBoxId() to resolve, so the
     *  JWT subject must be a real users(id). */
    private void actAsBox(User user, Membership membership) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(user.getId().toString())
                .claim("scope", "box").claim("box_id", membership.getBox().getId().toString())
                .claim("role", membership.getRole())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    // ───────────────────────── direct-controller tests (from the plan) ─────────────────────────

    @Test
    void aMemberWithNoStoredPreferencesSeesTheDefaults() {
        // The sparse-table trap: stored rows would render every switch off for a new member.
        actAsBox(athlete.getUser(), athlete);
        var rows = controller.mine();

        assertThat(rows).hasSize(12);
        assertThat(rows).allSatisfy(r -> assertThat(r.enabled()).isTrue());
    }

    @Test
    void savingOneTypeLeavesTheRestOnTheirDefaults() {
        actAsBox(athlete.getUser(), athlete);
        controller.save(List.of(new NotificationPrefController.PrefUpdate(
                "CLASS_CANCELLED", "IN_APP", false)));

        var rows = controller.mine().stream()
                .collect(Collectors.toMap(NotificationPrefController.PrefRow::type, r -> r));
        assertThat(rows.get("CLASS_CANCELLED").enabled()).isFalse();
        assertThat(rows.get("WAITLIST_PROMOTED").enabled()).isTrue();
    }

    @Test
    void aMandatoryTypeCannotBeSwitchedOff() {
        actAsBox(athlete.getUser(), athlete);
        assertThatThrownBy(() -> controller.save(List.of(
                new NotificationPrefController.PrefUpdate("PAYMENT_FAILED", "IN_APP", false))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("MANDATORY_NOTIFICATION");
    }

    @Test
    void mandatoryTypesReportThemselvesSoThePageCanLockThem() {
        actAsBox(athlete.getUser(), athlete);
        assertThat(controller.mine()).filteredOn(NotificationPrefController.PrefRow::mandatory)
                .extracting(NotificationPrefController.PrefRow::type)
                .containsExactlyInAnyOrder("SUBSCRIPTION_EXPIRING", "PAYMENT_FAILED", "MEMBERSHIP_BLOCKED");
    }

    @Test
    void undeliverableChannelsAreRefused() {
        actAsBox(athlete.getUser(), athlete);
        assertThatThrownBy(() -> controller.save(List.of(
                new NotificationPrefController.PrefUpdate("CLASS_CANCELLED", "PUSH", true))))
                .hasMessageContaining("CHANNEL_NOT_AVAILABLE");
    }

    @Test
    void typesWithNoInAppDeliveryAreNotOffered() {
        actAsBox(athlete.getUser(), athlete);
        // A switch that controls nothing is worse than an absent one. Guard against a vacuous
        // pass: doesNotContain is trivially true on an empty list, so assert the real size first.
        var rows = controller.mine();
        assertThat(rows).hasSize(12);
        assertThat(rows).extracting(NotificationPrefController.PrefRow::type)
                .doesNotContain("NEW_MESSAGE", "CLASS_STARTING_SOON");
    }

    // ───────────────────────── MockMvc: GET happy / auth-denied / cross-tenant-denied ─────────────────────────

    @Test
    void getHappy() throws Exception {
        mvc.perform(get("/api/box/me/notification-prefs")
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(12));
    }

    @Test
    void getAnonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/me/notification-prefs")).andExpect(status().isUnauthorized());
    }

    /** athlete stores an override; a foreign box's own token must still see ITS OWN default,
     *  never the row belonging to a membership in someone else's box. */
    @Test
    void getCrossTenantDenied() throws Exception {
        mvc.perform(put("/api/box/me/notification-prefs")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("[{\"type\":\"CLASS_CANCELLED\",\"channel\":\"IN_APP\",\"enabled\":false}]"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/me/notification-prefs")
                        .header("Authorization", "Bearer " + foreignAdminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'CLASS_CANCELLED')].enabled").value(true));
    }

    // ───────────────────────── MockMvc: PUT happy / auth-denied / cross-tenant-denied ─────────────────────────

    @Test
    void putHappy() throws Exception {
        mvc.perform(put("/api/box/me/notification-prefs")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("[{\"type\":\"CLASS_CANCELLED\",\"channel\":\"IN_APP\",\"enabled\":false}]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'CLASS_CANCELLED')].enabled").value(false));
    }

    @Test
    void putAnonymousIsRejected() throws Exception {
        // .with(csrf()) so the 401 we are actually testing is what comes back: without a CSRF token
        // an anonymous write is rejected 403 by the CSRF filter BEFORE authentication runs, and the
        // auth check this test exists for is never reached. Same reason AuthzConformanceTest adds it
        // to every non-GET probe (see its req()), and SuperadminBoxApiTest.
        mvc.perform(put("/api/box/me/notification-prefs").with(csrf())
                        .contentType(APPLICATION_JSON)
                        .content("[{\"type\":\"CLASS_CANCELLED\",\"channel\":\"IN_APP\",\"enabled\":false}]"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * A write from the foreign admin's token only ever touches THEIR OWN membership's prefs
     * (resolved via TenantContext from their own box-scoped token) — never `athlete`'s row in
     * `box`. Proven by checking athlete's own effective state is untouched afterward.
     */
    @Test
    void putCrossTenantDenied() throws Exception {
        mvc.perform(put("/api/box/me/notification-prefs")
                        .contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + foreignAdminToken)
                        .content("[{\"type\":\"CLASS_CANCELLED\",\"channel\":\"IN_APP\",\"enabled\":false}]"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/box/me/notification-prefs")
                        .header("Authorization", "Bearer " + athleteToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.type == 'CLASS_CANCELLED')].enabled").value(true));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private Membership member(User u, Box box, String role) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        return memberships.save(m);
    }
}
