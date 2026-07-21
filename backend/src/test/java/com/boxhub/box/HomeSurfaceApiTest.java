package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.*;
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
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Home aggregate + announcement + session detail + admin KPIs. */
class HomeSurfaceApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionService subscriptionService;
    @Autowired ObjectMapper om;

    String admin, coach, athlete, otherAthlete;
    UUID sessionId;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Hm A " + n, "hm-a-" + n);
        Box b = newBox("Hm B " + n, "hm-b-" + n);
        admin = member("hma-" + n + "@t.io", a, "BOX_ADMIN").token();
        coach = member("hmc-" + n + "@t.io", a, "COACH").token();
        TokMem athleteTm = member("hmx-" + n + "@t.io", a, "ATHLETE");
        athlete = athleteTm.token();
        otherAthlete = member("hmo-" + n + "@t.io", b, "ATHLETE").token();

        actAsBox(a.getId());
        ClassSession s = new ClassSession();
        s.setName("WOD Class");
        s.setStartAt(Instant.now().plusSeconds(7200));
        s.setDurationMin(60);
        s.setCapacity(12);
        sessions.save(s);
        sessionId = s.getId();
        // M10 T4: booking now requires an active subscription.
        Plan p = new Plan();
        p.setName("Plan");
        p.setDurationDays(30);
        UUID planId = plans.save(p).getId();
        subscriptionService.recordPeriod(athleteTm.membershipId(), planId, 0, "test");
        SecurityContextHolder.clearContext();
    }

    record TokMem(String token, UUID membershipId) {}

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String name, String slug) {
        Box x = new Box(); x.setName(name); x.setSlug(slug); x.setTimezone("Europe/Rome");
        return boxes.save(x);
    }

    private TokMem member(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        UUID mid = memberships.save(m).getId();
        return new TokMem(tokenService.boxToken(u, m), mid);
    }

    @Test
    void announcementLifecycle() throws Exception {
        mvc.perform(get("/api/box/announcement").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isNoContent());
        mvc.perform(put("/api/box/announcement").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + coach)
                        .content("{\"body\":\"Box closes early Friday\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/box/announcement").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("Box closes early Friday"));
        // athletes cannot write
        mvc.perform(put("/api/box/announcement").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athlete).content("{\"body\":\"hack\"}"))
                .andExpect(status().isForbidden());
        // other box sees nothing (tenant isolation)
        mvc.perform(get("/api/box/announcement").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNoContent());
    }

    @Test
    void homeAggregateShowsNextBookingAfterBooking() throws Exception {
        // empty home first
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextBooking").doesNotExist())
                .andExpect(jsonPath("$.stats.checkinsThisWeek").isNumber());
        // book the session
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + athlete))
                .andExpect(jsonPath("$.nextBooking.className").value("WOD Class"))
                .andExpect(jsonPath("$.nextBooking.bookedCount").value(1));
    }

    @Test
    void sessionDetailShowsGridAndIsMemberVisible() throws Exception {
        mvc.perform(post("/api/box/sessions/" + sessionId + "/book").header("Authorization", "Bearer " + athlete));
        mvc.perform(get("/api/box/sessions/" + sessionId + "/detail").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("WOD Class"))
                .andExpect(jsonPath("$.active.length()").value(1))
                .andExpect(jsonPath("$.active[0].name").isNotEmpty())
                .andExpect(jsonPath("$.queue.length()").value(0));
        // cross-tenant
        mvc.perform(get("/api/box/sessions/" + sessionId + "/detail").header("Authorization", "Bearer " + otherAthlete))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminStatsForAdminOnly() throws Exception {
        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeMembers").isNumber())
                .andExpect(jsonPath("$.weekAttendance.fillPct").isNumber());
        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    /**
     * M10: planExpiringSoon/planDaysLeft/expiringPlans all now read the active Subscription's
     * currentPeriodEnd (nothing writes the old Membership.expiresAt column any more) — pin all
     * three surfaces against a real subscription end rather than the dead field.
     */
    @Test
    void planExpirySurfacesReadTheActiveSubscriptionNotTheDeadExpiresAtColumn() throws Exception {
        long n = System.nanoTime();
        Box box = newBox("Exp " + n, "exp-" + n);
        String boxAdmin = member("expa-" + n + "@t.io", box, "BOX_ADMIN").token();
        TokMem soonTm = member("exps-" + n + "@t.io", box, "ATHLETE");
        TokMem farTm = member("expf-" + n + "@t.io", box, "ATHLETE");

        actAsBox(box.getId());
        Plan soonPlan = new Plan();
        soonPlan.setName("Soon " + n);
        soonPlan.setDurationDays(5); // inside both HomeController's 7-day and AdminStats' 15-day windows
        UUID soonPlanId = plans.save(soonPlan).getId();
        subscriptionService.recordPeriod(soonTm.membershipId(), soonPlanId, 0, "test");

        Plan farPlan = new Plan();
        farPlan.setName("Far " + n);
        farPlan.setDurationDays(60);
        UUID farPlanId = plans.save(farPlan).getId();
        subscriptionService.recordPeriod(farTm.membershipId(), farPlanId, 0, "test");
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + soonTm.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planExpiringSoon").value(true))
                .andExpect(jsonPath("$.stats.planDaysLeft").value(org.hamcrest.Matchers.lessThanOrEqualTo(5)));

        mvc.perform(get("/api/box/home").header("Authorization", "Bearer " + farTm.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planExpiringSoon").value(false));

        mvc.perform(get("/api/box/admin-stats").header("Authorization", "Bearer " + boxAdmin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expiringPlans").value(1)); // only the 5-day plan counts
    }
}
