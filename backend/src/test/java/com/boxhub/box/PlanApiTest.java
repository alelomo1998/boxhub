package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PlanApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;

    String adminToken, athleteToken, otherBoxAdminToken;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box boxA = newBox("Plan Box A " + n, "plan-a-" + n);
        Box boxB = newBox("Plan Box B " + n, "plan-b-" + n);
        adminToken = boxToken("padm-" + n + "@t.io", boxA, "BOX_ADMIN");
        athleteToken = boxToken("path-" + n + "@t.io", boxA, "ATHLETE");
        otherBoxAdminToken = boxToken("padm2-" + n + "@t.io", boxB, "BOX_ADMIN");
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    @Test
    void adminCreatesListsAndPatchesPlan() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Unlimited\",\"durationDays\":30}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Unlimited"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(get("/api/box/plans").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Unlimited"));

        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"durationDays\":45}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.durationDays").value(45));
    }

    @Test
    void duplicatePlanNameIs409() throws Exception {
        String body = "{\"name\":\"Dup Plan\",\"durationDays\":30}";
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + adminToken).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + adminToken).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void athleteCannotCreatePlan() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteToken)
                        .content("{\"name\":\"Nope\",\"durationDays\":30}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantPatchIs404() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Mine\",\"durationDays\":30}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        // other box's admin cannot even see it (tenant filter): 404, not 403 — no existence leak
        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + otherBoxAdminToken)
                        .content("{\"durationDays\":99}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void zeroDurationPatchIs400() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Valid Plan\",\"durationDays\":30}"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"durationDays\":0}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void negativeWeeklyLimitOnCreateIs400() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Neg Limit\",\"durationDays\":30,\"weeklyClassLimit\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createWithPriceAndEntitlementRoundTrips() throws Exception {
        String body = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Priced Unlimited\",\"durationDays\":30," +
                                "\"priceCents\":6500,\"currency\":\"eur\",\"entitlement\":\"UNLIMITED\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.priceCents").value(6500))
                .andExpect(jsonPath("$.currency").value("eur"))
                .andExpect(jsonPath("$.entitlement").value("UNLIMITED"))
                .andReturn().getResponse().getContentAsString();
        String id = om.readTree(body).get("id").asText();

        // list surfaces the price too, and a patch changes it
        mvc.perform(get("/api/box/plans").header("Authorization", "Bearer " + adminToken))
                .andExpect(jsonPath("$[?(@.id=='" + id + "')].priceCents").value(org.hamcrest.Matchers.hasItem(6500)));
        mvc.perform(patch("/api/box/plans/" + id).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"priceCents\":8000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceCents").value(8000));
    }

    @Test
    void createDefaultsEntitlementFromWeeklyLimitAndPriceToZero() throws Exception {
        // no price, no explicit entitlement, but a weekly limit -> WEEKLY_LIMIT, price 0, eur
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Three A Week\",\"durationDays\":30,\"weeklyClassLimit\":3}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entitlement").value("WEEKLY_LIMIT"))
                .andExpect(jsonPath("$.priceCents").value(0))
                .andExpect(jsonPath("$.currency").value("eur"));
    }

    @Test
    void weeklyLimitEntitlementWithoutALimitIs400() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Bad\",\"durationDays\":30,\"entitlement\":\"WEEKLY_LIMIT\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createAcceptsTheEightLimitsAndDerivesTheLegacyEntitlementFields() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Punch Card\",\"durationDays\":30,\"entriesTotal\":10}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entriesTotal").value(10))
                .andExpect(jsonPath("$.entriesPerWeek").doesNotExist())
                // A punch card has a limit, so the derived legacy field must not claim UNLIMITED.
                .andExpect(jsonPath("$.entitlement").value("WEEKLY_LIMIT"))
                .andExpect(jsonPath("$.weeklyClassLimit").doesNotExist());
    }

    @Test
    void weeklyClassLimitStillMapsOntoEntriesPerWeekForTheUnrebuiltAdminScreen() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Legacy Three\",\"durationDays\":30,\"weeklyClassLimit\":3,"
                                + "\"entitlement\":\"WEEKLY_LIMIT\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entriesPerWeek").value(3))
                .andExpect(jsonPath("$.weeklyClassLimit").value(3));
    }

    @Test
    void aPlanInheritsTheBoxsCurrencyWhenNoneIsSent() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Inherit " + System.nanoTime() + "\",\"durationDays\":30,\"priceCents\":5000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currency").value("eur"));
    }

    /**
     * Before M39 currency was free text accepted verbatim, so one box could hold a eur plan and a
     * usd plan and a revenue SUM would add cents of euros to cents of dollars. A mismatch is
     * REJECTED rather than silently corrected: a client sending the wrong currency has a bug, and
     * quietly fixing it would hide that while looking like it worked.
     */
    @Test
    void aPlanInADifferentCurrencyFromTheBoxIsRejected() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Dollars " + System.nanoTime() + "\",\"durationDays\":30,"
                                + "\"priceCents\":5000,\"currency\":\"usd\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void patchingAPlanToAnotherCurrencyIsRejected() throws Exception {
        String created = mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Patchme " + System.nanoTime() + "\",\"durationDays\":30,\"priceCents\":5000}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String planId = om.readTree(created).get("id").asText();

        mvc.perform(patch("/api/box/plans/" + planId).contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"currency\":\"gbp\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void theBoxsCurrencyIsOnTheCurrentBoxResponse() throws Exception {
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("eur"));
    }

    /**
     * Changing the box currency is allowed only while it can still be made true of the WHOLE box.
     * Once a plan exists in the old currency, switching would leave that plan mismatched and put the
     * box back into the mixed state boxes.currency exists to prevent.
     */
    @Test
    void changingTheBoxCurrencyIsRefusedOnceAPlanExistsInTheOldOne() throws Exception {
        mvc.perform(post("/api/box/plans").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"name\":\"Blocker " + System.nanoTime() + "\",\"durationDays\":30,\"priceCents\":5000}"))
                .andExpect(status().isCreated());

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"currency\":\"gbp\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void aBoxWithNoPlansCanStillSetItsCurrency() throws Exception {
        long n = System.nanoTime();
        Box fresh = newBox("Currency Box " + n, "currency-box-" + n);
        String token = boxToken("cur-" + n + "@t.io", fresh, "BOX_ADMIN");

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content("{\"currency\":\"GBP\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("gbp"));   // normalised, not stored as sent
    }

    @Test
    void aNonsenseCurrencyIsRejected() throws Exception {
        long n = System.nanoTime();
        Box fresh = newBox("Bad Currency Box " + n, "bad-currency-" + n);
        String token = boxToken("badcur-" + n + "@t.io", fresh, "BOX_ADMIN");

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content("{\"currency\":\"euros\"}"))
                .andExpect(status().isBadRequest());
    }
}
