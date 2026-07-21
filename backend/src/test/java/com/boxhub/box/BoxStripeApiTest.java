package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.CryptoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxStripeApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired BoxStripeRepository stripeRepo;
    @Autowired CryptoService crypto;

    Box boxA, boxB;
    String adminTokenA, athleteTokenA, adminTokenB;

    private static final String RESTRICTED_KEY = "rk_test_51ABCDEFrestrictedkeymaterial";
    private static final String WEBHOOK_SECRET = "whsec_testwebhooksecretmaterial";

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        boxA = newBox("Stripe Box A " + n, "stripe-a-" + n);
        boxB = newBox("Stripe Box B " + n, "stripe-b-" + n);
        adminTokenA = boxToken("sadm-" + n + "@t.io", boxA, "BOX_ADMIN");
        athleteTokenA = boxToken("sath-" + n + "@t.io", boxA, "ATHLETE");
        adminTokenB = boxToken("sadm2-" + n + "@t.io", boxB, "BOX_ADMIN");
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

    private String connectBody() {
        return "{\"restrictedKey\":\"" + RESTRICTED_KEY + "\",\"webhookSecret\":\"" + WEBHOOK_SECRET + "\"}";
    }

    @Test
    void adminConnectsAndCredentialsAreEncryptedAtRest() throws Exception {
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(connectBody()))
                .andExpect(status().isNoContent());

        BoxStripe row = stripeRepo.findByBoxId(boxA.getId()).orElseThrow();
        assertThat(row.getRestrictedKeyEnc()).isNotEqualTo(RESTRICTED_KEY);
        assertThat(row.getWebhookSecretEnc()).isNotEqualTo(WEBHOOK_SECRET);
        assertThat(crypto.decrypt(row.getRestrictedKeyEnc())).isEqualTo(RESTRICTED_KEY);
        assertThat(crypto.decrypt(row.getWebhookSecretEnc())).isEqualTo(WEBHOOK_SECRET);
    }

    @Test
    void getReturnsConnectedFlagOnlyAndNeverLeaksKeyMaterial() throws Exception {
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(connectBody()))
                .andExpect(status().isNoContent());

        String raw = mvc.perform(get("/api/box/stripe").header("Authorization", "Bearer " + adminTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(true))
                .andReturn().getResponse().getContentAsString();

        assertThat(raw).doesNotContain(RESTRICTED_KEY);
        assertThat(raw).doesNotContain(WEBHOOK_SECRET);
    }

    @Test
    void getBeforeConnectIsFalse() throws Exception {
        mvc.perform(get("/api/box/stripe").header("Authorization", "Bearer " + adminTokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(false));
    }

    @Test
    void athleteCannotConnectOrRead() throws Exception {
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + athleteTokenA)
                        .content(connectBody()))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/box/stripe").header("Authorization", "Bearer " + athleteTokenA))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantAdminNeverSeesOrAffectsAnotherBoxsConnection() throws Exception {
        // box A connects
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(connectBody()))
                .andExpect(status().isNoContent());

        // box B's admin, scoped only by their own JWT box_id, sees their own (unconnected) status —
        // never box A's, even though BoxStripe carries no @TenantId discriminator.
        mvc.perform(get("/api/box/stripe").header("Authorization", "Bearer " + adminTokenB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connected").value(false));

        // box B's admin disconnecting only touches box B's (absent) row — box A stays connected.
        mvc.perform(delete("/api/box/stripe").header("Authorization", "Bearer " + adminTokenB))
                .andExpect(status().isNoContent());

        assertThat(stripeRepo.findByBoxId(boxA.getId())).isPresent();
        mvc.perform(get("/api/box/stripe").header("Authorization", "Bearer " + adminTokenA))
                .andExpect(jsonPath("$.connected").value(true));
    }

    @Test
    void connectWithBlankRestrictedKeyIs400() throws Exception {
        String body = "{\"restrictedKey\":\"\",\"webhookSecret\":\"" + WEBHOOK_SECRET + "\"}";
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void connectWithBlankWebhookSecretIs400() throws Exception {
        String body = "{\"restrictedKey\":\"" + RESTRICTED_KEY + "\",\"webhookSecret\":\"\"}";
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void reconnectOverwritesRatherThanDuplicating() throws Exception {
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(connectBody()))
                .andExpect(status().isNoContent());

        String secondKey = "rk_test_SECONDrestrictedkeymaterial";
        String secondSecret = "whsec_SECONDwebhooksecretmaterial";
        String secondBody = "{\"restrictedKey\":\"" + secondKey + "\",\"webhookSecret\":\"" + secondSecret + "\"}";
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(secondBody))
                .andExpect(status().isNoContent());

        assertThat(stripeRepo.findAll().stream().filter(r -> r.getBoxId().equals(boxA.getId())).count()).isEqualTo(1);
        BoxStripe row = stripeRepo.findByBoxId(boxA.getId()).orElseThrow();
        assertThat(crypto.decrypt(row.getRestrictedKeyEnc())).isEqualTo(secondKey);
        assertThat(crypto.decrypt(row.getWebhookSecretEnc())).isEqualTo(secondSecret);
    }

    @Test
    void disconnectRemovesCredentials() throws Exception {
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminTokenA)
                        .content(connectBody()))
                .andExpect(status().isNoContent());

        mvc.perform(delete("/api/box/stripe").header("Authorization", "Bearer " + adminTokenA))
                .andExpect(status().isNoContent());

        assertThat(stripeRepo.findByBoxId(boxA.getId())).isEmpty();
        mvc.perform(get("/api/box/stripe").header("Authorization", "Bearer " + adminTokenA))
                .andExpect(jsonPath("$.connected").value(false));
    }
}
