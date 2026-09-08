package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxSettingsTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String adminToken, athleteToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Settings Box " + n);
        b.setSlug("set-" + n);
        b.setTimezone("Europe/Rome");
        boxes.save(b);
        User admin = authService.register("sadm-" + n + "@t.io", "correct-horse-battery", "SAdm");
        Membership ma = new Membership();
        ma.setUser(admin); ma.setBox(b); ma.setRole("BOX_ADMIN");
        memberships.save(ma);
        adminToken = tokenService.boxToken(admin, ma);
        User ath = authService.register("sath-" + n + "@t.io", "correct-horse-battery", "SAth");
        Membership mt = new Membership();
        mt.setUser(ath); mt.setBox(b); mt.setRole("ATHLETE");
        memberships.save(mt);
        athleteToken = tokenService.boxToken(ath, mt);
    }

    @Test
    void adminUpdatesSettings() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Renamed Box\",\"logoUrl\":\"https://cdn.example.com/logo.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed Box"))
                .andExpect(jsonPath("$.logoUrl").value("https://cdn.example.com/logo.png"));

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.name").value("Renamed Box"))
                .andExpect(jsonPath("$.logoUrl").value("https://cdn.example.com/logo.png"));
    }

    @Test
    void athleteCannotUpdateSettings() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"Hax\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidTimezoneIs400NotPersisted() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"timezone\":\"Not/AZone\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.timezone").value("Europe/Rome"));
    }

    @Test
    void currentServesTheCancellationPolicyFlagsDefaultingToTodaysBehaviour() throws Exception {
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowLateCancel").value(false))
                .andExpect(jsonPath("$.lateCancelRefundsEntry").value(false))
                .andExpect(jsonPath("$.countWaitlistCancellations").value(false));
    }

    @Test
    void adminCanPatchTheCancellationPolicy() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"allowLateCancel\":true,\"lateCancelRefundsEntry\":true,"
                                + "\"countWaitlistCancellations\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowLateCancel").value(true))
                .andExpect(jsonPath("$.lateCancelRefundsEntry").value(true))
                .andExpect(jsonPath("$.countWaitlistCancellations").value(true));
    }

    @Test
    void anAthleteCannotPatchTheCancellationPolicy() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"allowLateCancel\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void newBoxDefaultsToKgAndPatchToLbRoundTrips() throws Exception {
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weightUnit").value("KG"));

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"weightUnit\":\"LB\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weightUnit").value("LB"));

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.weightUnit").value("LB"));
    }

    @Test
    void invalidWeightUnitIs400NotPersisted() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"weightUnit\":\"STONE\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$.weightUnit").value("KG"));
    }

    @Test
    void anAthleteCannotPatchTheWeightUnit() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"weightUnit\":\"LB\"}"))
                .andExpect(status().isForbidden());
    }

    /** CROSS-TENANT-DENIED: box/settings and box/current resolve the tenant only from the JWT
     *  (no id in the URL), so box A's admin patching weightUnit must never touch box B. */
    @Test
    void crossTenantAdminCannotAffectAnotherBoxsWeightUnit() throws Exception {
        long n = System.nanoTime();
        Box other = new Box();
        other.setName("Other Weight Box " + n);
        other.setSlug("owb-" + n);
        other.setTimezone("Europe/Rome");
        boxes.save(other);
        User otherAdmin = authService.register("owadm-" + n + "@t.io", "correct-horse-battery", "OWAdm");
        Membership om = new Membership();
        om.setUser(otherAdmin); om.setBox(other); om.setRole("BOX_ADMIN");
        memberships.save(om);
        String otherAdminToken = tokenService.boxToken(otherAdmin, om);

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"weightUnit\":\"LB\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weightUnit").value("LB"));

        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + otherAdminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weightUnit").value("KG"));
    }
}
