package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.Mailer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Every assertion reads persisted state (never just a status code) — same convention as
 * StripeWebhookTest, so a silently-scoped-to-nothing tenant bug would fail loudly here.
 */
class SubscriptionApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired SubscriptionService subscriptionService;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired BoxStripeRepository boxStripe;
    @Autowired ObjectMapper om;
    @MockitoBean Mailer mailer;

    Box boxA, boxB;
    String adminTokenA, athleteTokenA, adminTokenB;
    Membership adminMembershipA, athleteMembershipA;
    User athleteUserA;
    Plan planA;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    /** Plan/Subscription/Payment are @TenantId; a direct repository save/read needs a box-scoped
     *  Authentication in place first, or it silently resolves to the NO_TENANT sentinel (insert:
     *  FK violation on box_id; read: filtered to nothing). MockMvc's filter chain clears
     *  SecurityContextHolder at the end of every request, so this must be re-called after any
     *  mvc.perform() that precedes a direct @TenantId repository read — same convention as
     *  StripeWebhookTest.actAsBox. */
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @BeforeEach
    void setup() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));

        long n = System.nanoTime();
        boxA = newBox("Sub Box A " + n, "sub-a-" + n);
        boxB = newBox("Sub Box B " + n, "sub-b-" + n);

        User adminUserA = authService.register("sadm-" + n + "@t.io", "correct-horse-battery", "Sub Admin");
        adminMembershipA = member(adminUserA, boxA, "BOX_ADMIN");
        adminTokenA = tokenService.boxToken(adminUserA, adminMembershipA);

        athleteUserA = authService.register("sath-" + n + "@t.io", "correct-horse-battery", "Sub Athlete");
        athleteMembershipA = member(athleteUserA, boxA, "ATHLETE");
        athleteTokenA = tokenService.boxToken(athleteUserA, athleteMembershipA);

        User adminUserB = authService.register("sadm2-" + n + "@t.io", "correct-horse-battery", "Sub Admin B");
        Membership adminMembershipB = member(adminUserB, boxB, "BOX_ADMIN");
        adminTokenB = tokenService.boxToken(adminUserB, adminMembershipB);

        actAsBox(boxA.getId()); // Plan is @TenantId — needed for this direct save
        planA = new Plan();
        planA.setName("Monthly " + n);
        planA.setDurationDays(30);
        planA.setPriceCents(5000);
        planA.setCurrency("eur");
        planA.setEntitlement("UNLIMITED");
        planA = plans.save(planA);
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

    private String recordBody(String membershipId, String planId, String method, int priceCents) {
        return """
                {"membershipId":"%s","planId":"%s","method":"%s","priceCents":%d,"priceNote":"negotiated"}
                """.formatted(membershipId, planId, method, priceCents);
    }

    @Test
    void adminRecordsCashBelowListPriceCreatesSubscriptionPaymentAndReceiptMail() throws Exception {
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 3000)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.priceCents").value(3000))
                .andExpect(jsonPath("$.paymentId").exists())
                .andReturn().getResponse().getContentAsString();

        actAsBox(boxA.getId()); // re-establish: MockMvc's filter chain cleared it after the request
        Subscription sub = subscriptions.findByMembershipIdAndStatus(athleteMembershipA.getId(), "ACTIVE").orElseThrow();
        assertThat(sub.getPriceCents()).isEqualTo(3000); // agreed price, below the plan's 5000 list price
        assertThat(sub.getPlanId()).isEqualTo(planA.getId());
        assertThat(sub.getCurrentPeriodEnd()).isAfter(java.time.Instant.now().plusSeconds(29L * 24 * 3600));

        Payment payment = payments.findAll().stream()
                .filter(p -> p.getSubscriptionId().equals(sub.getId())).findFirst().orElseThrow();
        assertThat(payment.getAmountCents()).isEqualTo(3000);
        assertThat(payment.getMethod()).isEqualTo("CASH");
        assertThat(payment.getStatus()).isEqualTo("SUCCEEDED");
        assertThat(payment.getRecordedBy()).isEqualTo(adminMembershipA.getId());

        // the response's paymentId is the ID of the Payment row this request actually created —
        // that is what makes GET /receipts/:paymentId (and the Angular route of the same shape,
        // receipts/:paymentId) reachable from the admin UI right after recording a payment.
        UUID paymentId = UUID.fromString(om.readTree(body).get("paymentId").asText());
        assertThat(paymentId).isEqualTo(payment.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> varsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(eq(athleteUserA.getEmail()), any(), eq("payment-receipt"), varsCaptor.capture());
        // Pins the exact emailed link path against the real Angular route (app.routes.ts:
        // `receipts/:paymentId`, plural) — a documented gotcha is a mismatched path here shipping
        // a dead link.
        assertThat(varsCaptor.getValue().get("link")).isEqualTo("https://boxhub.test/receipts/" + payment.getId());

        // T1 debt discharge: the member list now reads the plan off the active subscription.
        mvc.perform(get("/api/box/members").header("Authorization", "Bearer " + adminTokenA)
                        .param("search", "Sub Athlete"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].planId").value(planA.getId().toString()))
                .andExpect(jsonPath("$.content[0].planName").value(planA.getName()));
    }

    @Test
    void stripeMethodIsRejectedOnTheAdminEndpoint() throws Exception {
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "STRIPE", 5000)))
                .andExpect(status().isBadRequest());

        actAsBox(boxA.getId());
        assertThat(subscriptions.findByMembershipIdAndStatus(athleteMembershipA.getId(), "ACTIVE")).isEmpty();
    }

    @Test
    void athleteCannotRecordAPayment() throws Exception {
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 3000)))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantAdminCannotRecordAPaymentForAnotherBoxsMembership() throws Exception {
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenB)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 3000)))
                .andExpect(status().isNotFound());

        actAsBox(boxA.getId());
        assertThat(subscriptions.findByMembershipIdAndStatus(athleteMembershipA.getId(), "ACTIVE")).isEmpty();
    }

    @Test
    void nullMembershipIdIs400NotA500() throws Exception {
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content("{\"planId\":\"" + planA.getId() + "\",\"method\":\"CASH\",\"priceCents\":3000}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nullPlanIdIs400NotA500() throws Exception {
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content("{\"membershipId\":\"" + athleteMembershipA.getId() + "\",\"method\":\"CASH\",\"priceCents\":3000}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cancelFreesTheActiveSlotSoADifferentPlanCanThenBeRecorded() throws Exception {
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 5000)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID subscriptionId = UUID.fromString(om.readTree(body).get("id").asText());

        actAsBox(boxA.getId());
        Plan planB = new Plan();
        planB.setName("Other plan " + System.nanoTime());
        planB.setDurationDays(30);
        planB.setPriceCents(4000);
        planB.setCurrency("eur");
        planB.setEntitlement("UNLIMITED");
        planB = plans.save(planB);
        SecurityContextHolder.clearContext();

        // before cancelling, recording a DIFFERENT plan is refused — same-plan-active invariant
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planB.getId().toString(), "CASH", 4000)))
                .andExpect(status().isConflict());

        mvc.perform(delete("/api/box/subscriptions/" + subscriptionId)
                        .header("Authorization", "Bearer " + adminTokenA))
                .andExpect(status().isNoContent());

        actAsBox(boxA.getId());
        assertThat(subscriptions.findById(subscriptionId).orElseThrow().getStatus()).isEqualTo("CANCELED");
        SecurityContextHolder.clearContext();

        // now the slot is free — a different plan can be recorded
        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planB.getId().toString(), "CASH", 4000)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.planId").value(planB.getId().toString()));
    }

    @Test
    void athleteCannotCancelASubscription() throws Exception {
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 5000)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID subscriptionId = UUID.fromString(om.readTree(body).get("id").asText());

        mvc.perform(delete("/api/box/subscriptions/" + subscriptionId)
                        .header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isForbidden());

        actAsBox(boxA.getId());
        assertThat(subscriptions.findById(subscriptionId).orElseThrow().getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void crossTenantCancelIs404() throws Exception {
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 5000)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID subscriptionId = UUID.fromString(om.readTree(body).get("id").asText());

        mvc.perform(delete("/api/box/subscriptions/" + subscriptionId)
                        .header("Authorization", "Bearer " + adminTokenB))
                .andExpect(status().isNotFound());

        actAsBox(boxA.getId());
        assertThat(subscriptions.findById(subscriptionId).orElseThrow().getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void athleteCheckoutWithNoBoxStripeConnectedIs403() throws Exception {
        mvc.perform(post("/api/box/subscriptions/checkout").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteTokenA)
                        .content("{\"planId\":\"" + planA.getId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void meSubscriptionReturnsOwnActiveSubscriptionAndStripeAvailability() throws Exception {
        // Before any payment or Stripe connection: no subscription, stripe unavailable.
        mvc.perform(get("/api/box/me/subscription").header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subscription").doesNotExist())
                .andExpect(jsonPath("$.stripeAvailable").value(false));

        BoxStripe bs = new BoxStripe();
        bs.setBoxId(boxA.getId());
        bs.setRestrictedKeyEnc("enc-key");
        bs.setWebhookSecretEnc("enc-secret");
        bs.setEnabled(true);
        boxStripe.save(bs);

        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 5000)))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/box/me/subscription").header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stripeAvailable").value(true))
                .andExpect(jsonPath("$.subscription.status").value("ACTIVE"))
                .andExpect(jsonPath("$.plan.name").value(planA.getName()));
    }

    @Test
    void receiptIsReadableByThePayerAndTheBoxAdminButNotByAnotherMemberOrAnotherBox() throws Exception {
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 3000)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID subscriptionId = UUID.fromString(om.readTree(body).get("id").asText());
        actAsBox(boxA.getId()); // re-establish: MockMvc's filter chain cleared it after the request
        Payment payment = payments.findAll().stream()
                .filter(p -> p.getSubscriptionId().equals(subscriptionId)).findFirst().orElseThrow();

        // the payer reads their own receipt
        mvc.perform(get("/api/box/receipts/" + payment.getId()).header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountCents").value(3000))
                .andExpect(jsonPath("$.listPriceCents").value(5000))
                .andExpect(jsonPath("$.discountCents").value(2000))
                .andExpect(jsonPath("$.planName").value(planA.getName()))
                .andExpect(jsonPath("$.boxName").value(boxA.getName()));

        // the box admin reads it too
        mvc.perform(get("/api/box/receipts/" + payment.getId()).header("Authorization", "Bearer " + adminTokenA))
                .andExpect(status().isOk());

        // a different member of the SAME box cannot
        long n = System.nanoTime();
        User otherAthleteUser = authService.register("sath2-" + n + "@t.io", "correct-horse-battery", "Other Athlete");
        Membership otherAthlete = member(otherAthleteUser, boxA, "ATHLETE");
        String otherAthleteToken = tokenService.boxToken(otherAthleteUser, otherAthlete);
        // same box, so the tenant-scoped lookup finds the payment — the per-row auth check denies it
        mvc.perform(get("/api/box/receipts/" + payment.getId()).header("Authorization", "Bearer " + otherAthleteToken))
                .andExpect(status().isForbidden());

        // cross-tenant: box B's admin can't see it either (tenant-scoped lookup finds nothing)
        mvc.perform(get("/api/box/receipts/" + payment.getId()).header("Authorization", "Bearer " + adminTokenB))
                .andExpect(status().isNotFound());
    }

    @Test
    void aReceiptWithNoRecordedListPriceOmitsTheDiscountEntirely() throws Exception {
        // A Payment row with listPriceCents == null (i.e. created before M12b) must render with NO
        // discount figure — not a discount computed against today's plan price. This is the fix:
        // the omission, not the column.
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 4000)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID subscriptionId = UUID.fromString(om.readTree(body).get("id").asText());

        actAsBox(boxA.getId());
        Payment payment = payments.findAll().stream()
                .filter(p -> p.getSubscriptionId().equals(subscriptionId)).findFirst().orElseThrow();
        payment.setListPriceCents(null); // simulate a pre-M12b row
        payments.save(payment);

        Plan plan = plans.findById(planA.getId()).orElseThrow();
        plan.setPriceCents(9000); // raise the plan's CURRENT price well above the amount paid
        plans.save(plan);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/receipts/" + payment.getId()).header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountCents").value(4000))
                .andExpect(jsonPath("$.listPriceCents").doesNotExist())
                .andExpect(jsonPath("$.discountCents").doesNotExist());
    }

    @Test
    void aReceiptReportsTheDiscountAgainstThePriceStoredAtPaymentTime() throws Exception {
        // Seed a payment with listPriceCents = 5000 (the plan's list price at payment time), amount
        // 4000 -> discount 1000. Then raise the plan to 9000 and re-fetch: the discount must STILL
        // be 1000, not 5000 (against today's price) and certainly not 5000 (9000-4000).
        String body = mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 4000)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID subscriptionId = UUID.fromString(om.readTree(body).get("id").asText());

        actAsBox(boxA.getId());
        Payment payment = payments.findAll().stream()
                .filter(p -> p.getSubscriptionId().equals(subscriptionId)).findFirst().orElseThrow();
        assertThat(payment.getListPriceCents()).isEqualTo(5000); // snapshotted at record time

        Plan plan = plans.findById(planA.getId()).orElseThrow();
        plan.setPriceCents(9000);
        plans.save(plan);
        SecurityContextHolder.clearContext();

        mvc.perform(get("/api/box/receipts/" + payment.getId()).header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountCents").value(4000))
                .andExpect(jsonPath("$.listPriceCents").value(5000))
                .andExpect(jsonPath("$.discountCents").value(1000));
    }

    @Test
    void recordingTheFirstRealPaymentReplacesTheCompInsteadOfDemandingACancel() throws Exception {
        // A comp is a PLACEHOLDER so the member can book while the box bills them offline (M12b),
        // not a plan anyone chose. Recording their first real payment must replace it silently —
        // demanding a manual cancel first made SWITCH_REQUIRES_CANCEL unactionable in exactly the
        // flow where it fires most often, and an e2e run caught it after the comp shipped.
        // Before the fix this returns 409 SWITCH_REQUIRES_CANCEL.
        actAsBox(boxA.getId());
        subscriptionService.comp(athleteMembershipA.getId());
        assertThat(subscriptionService.activeFor(athleteMembershipA.getId())).isPresent();
        SecurityContextHolder.clearContext();

        mvc.perform(post("/api/box/subscriptions").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(recordBody(athleteMembershipA.getId().toString(), planA.getId().toString(), "CASH", 4000)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.planId").value(planA.getId().toString()));

        actAsBox(boxA.getId());
        Subscription active = subscriptionService.activeFor(athleteMembershipA.getId()).orElseThrow();
        assertThat(active.getPlanId()).isEqualTo(planA.getId());
        assertThat(active.getCurrentPeriodEnd()).isNotNull(); // a real period, not the comp's null end
    }
}
