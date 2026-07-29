package com.boxhub.security;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassTemplate;
import com.boxhub.box.ClassTemplateRepository;
import com.boxhub.box.Payment;
import com.boxhub.box.PaymentRepository;
import com.boxhub.box.Plan;
import com.boxhub.box.PlanRepository;
import com.boxhub.box.Subscription;
import com.boxhub.box.SubscriptionRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proves secrets never reach the logs — by reading what was actually logged, not by grepping the
 * source for log statements that happen to look safe.
 * <p>
 * A {@link ListAppender} is attached to the ROOT logger, so it sees everything every logger in the
 * process emits (child loggers are additive), then the four surfaces that handle credential material
 * are driven end to end: login, refresh, Stripe connect ({@code PUT /api/box/stripe}), and a webhook
 * call that reaches the signature check — i.e. one that makes the controller actually
 * {@code decrypt()} the box's webhook secret and hand the plaintext to Stripe's verifier, which is
 * the moment a careless log line or a leaked exception message would burn it.
 * <p>
 * Verbose levels are forced below. That is the point: at the default INFO almost nothing is emitted
 * and the test would pass vacuously. {@code capturedText()} is asserted non-empty and to contain
 * real request-driven work ({@code box_stripe} SQL) before any absence is claimed.
 */
@TestPropertySource(properties = {
        // Deliberately verbose — log hygiene has to hold under the noisiest level an operator might
        // plausibly turn on while debugging, not just at the default INFO.
        "logging.level.com.boxhub=TRACE",
        // TRACE, not DEBUG: at DEBUG, Spring's LogFormatUtils.formatValue truncates a logged
        // request/response body at 100 chars, so any secret sitting past that offset could not be
        // detected even with redaction removed — two of this class's assertions were vacuous for
        // exactly that reason (webhookSecret at ~char 90 of ConnectRequest, the invite link past
        // ~100 of CreatedInviteResponse). TRACE logs the body untruncated.
        "logging.level.org.springframework.web=TRACE",
        "logging.level.org.springframework.security=DEBUG",
        "logging.level.org.hibernate.SQL=DEBUG"
})
class LogHygieneTest extends AbstractIntegrationTest {

    private static final String PASSWORD = "correct-horse-battery";
    private static final String RESTRICTED_KEY = "rk_test_LOGHYGIENE_restricted_key_material_zz";
    private static final String WEBHOOK_SECRET = "whsec_LOGHYGIENE_webhook_signing_secret_zz";
    // Must match AbstractIntegrationTest's @TestPropertySource values exactly.
    private static final String ENC_KEY = "HYjgfGYymYYLNWDjEGICrN1gXPc6SkDd8lVuYB/4vfo=";
    private static final String JWT_SECRET = "test-only-jwt-secret-must-be-at-least-32-bytes!";
    private static final String MEDIA_LINK_SECRET = "test-only-media-link-secret-padded-to-32";

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;
    @Autowired TokenService tokenService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired PlanRepository plans;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired PaymentRepository payments;
    @Autowired ClassTemplateRepository classTemplates;

    private Logger root;
    private ListAppender<ILoggingEvent> captured;

    @BeforeEach
    void attachAppender() {
        root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        captured = new ListAppender<>();
        captured.start();
        root.addAppender(captured);
    }

    @AfterEach
    void detachAppender() {
        root.detachAppender(captured);
        captured.stop();
        SecurityContextHolder.clearContext();
    }

    @Test
    void noSecretMaterialReachesTheLogsAcrossAuthStripeConnectAndWebhook() throws Exception {
        long n = System.nanoTime();

        // --- fixture: a box admin, and a PENDING Stripe payment for that box ---------------------
        Box box = new Box();
        box.setName("Log Hygiene " + n);
        box.setSlug("log-hygiene-" + n);
        box.setTimezone("Europe/Rome");
        box = boxes.save(box);

        String email = "hygiene-" + n + "@t.io";
        User admin = authService.register(email, PASSWORD, "Hygiene Admin");
        admin.setEmailVerified(true);
        users.save(admin);
        Membership m = new Membership();
        m.setUser(admin);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        m = memberships.save(m);
        String boxToken = tokenService.boxToken(admin, m);

        actAsBox(box.getId());
        Plan plan = new Plan();
        plan.setName("Hygiene " + n);
        plan.setDurationDays(30);
        plan.setPriceCents(5000);
        plan.setCurrency("eur");
        plan.setEntitlement("UNLIMITED");
        plan = plans.save(plan);

        Subscription sub = new Subscription();
        sub.setMembershipId(m.getId());
        sub.setPlanId(plan.getId());
        sub.setStatus("ACTIVE");
        sub.setPriceCents(0);
        UUID subscriptionId = subscriptions.save(sub).getId();

        // Gives step 7 something to serialize: ClassTemplate is @TenantId, so without a row here
        // the listing comes back empty, TemplateDto.of never runs, and MediaSigner.sign() is
        // never called inside the capture window — the media-secret assertion would be vacuous.
        ClassTemplate tpl = new ClassTemplate();
        tpl.setName("Hygiene " + n);
        tpl.setWeekday(1);
        tpl.setStartTime(java.time.LocalTime.of(7, 0));
        tpl.setDurationMin(60);
        tpl.setCapacity(10);
        tpl.setImagePath("/media/" + box.getId() + "/hygiene.jpg");
        classTemplates.save(tpl);

        String sessionId = "cs_test_hygiene_" + n;
        Payment payment = new Payment();
        payment.setSubscriptionId(subscriptionId);
        payment.setAmountCents(5000);
        payment.setCurrency("eur");
        payment.setMethod("STRIPE");
        payment.setStatus("PENDING");
        payment.setStripeSessionId(sessionId);
        payments.save(payment);
        SecurityContextHolder.clearContext();

        // --- drive the credential-handling surfaces ----------------------------------------------
        // 1. Stripe connect — plaintext restricted key + webhook secret in the request body.
        mvc.perform(put("/api/box/stripe").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + boxToken)
                        .content("{\"restrictedKey\":\"" + RESTRICTED_KEY + "\","
                                + "\"webhookSecret\":\"" + WEBHOOK_SECRET + "\"}"))
                .andExpect(status().isNoContent());

        // 2. Login — password in, session JWT + refresh token out.
        MvcResult login = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie accessCookie = login.getResponse().getCookie("bh_at");
        Cookie refreshCookie = login.getResponse().getCookie("bh_rt");
        assertThat(accessCookie).isNotNull();
        assertThat(refreshCookie).isNotNull();

        // 3. Refresh — the rotated refresh token must not be logged either.
        MvcResult refreshed = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(refreshCookie))
                .andExpect(status().isOk())
                .andReturn();
        Cookie rotatedRefresh = refreshed.getResponse().getCookie("bh_rt");
        assertThat(rotatedRefresh).isNotNull();

        // 4. Webhook, with a signature signed by the WRONG secret. This is the deep path on purpose:
        //    the controller finds the payment, decrypts THIS box's webhook secret and passes the
        //    plaintext to Stripe's verifier, which throws — exactly where a secret would leak into a
        //    log line or an exception message. Rejected with 400, nothing written.
        String payload = "{\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\""
                + sessionId + "\",\"payment_status\":\"paid\"}}}";
        mvc.perform(post("/api/stripe/webhook").contentType(APPLICATION_JSON)
                        .header("Stripe-Signature", signatureHeader(payload, "whsec_a_different_secret_entirely"))
                        .content(payload))
                .andExpect(status().isBadRequest());

        // 5. Invite creation — the response body carries /join/<raw invite token>, a single-use
        //    credential that grants membership, and Spring logs response bodies too.
        String inviteeEmail = "invitee-" + n + "@t.io";
        String inviteJson = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + boxToken)
                        .content("{\"email\":\"" + inviteeEmail + "\",\"role\":\"ATHLETE\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String inviteToken = inviteJson.replaceAll("(?s).*\"link\"\\s*:\\s*\"/join/([^\"]+)\".*", "$1");
        assertThat(inviteToken).as("raw invite token extracted from the response").doesNotContain("{");

        // 6. TV pairing — the pair response legitimately hands the display its claim secret, which
        //    means the response-body logger sees it.
        String pairJson = mvc.perform(post("/api/tv/pair").with(csrf()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String pairSecret = pairJson.replaceAll("(?s).*\"secret\"\\s*:\\s*\"([^\"]+)\".*", "$1");
        assertThat(pairSecret).as("pairing secret extracted from the response").doesNotContain("{");

        // 7. A response whose DTO runs every media path through MediaSigner, so the signing path
        //    is actually exercised inside the capture window rather than asserted against in the
        //    abstract.
        mvc.perform(get("/api/box/class-templates").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isOk());

        // Mailer.send is @Async, so the fixture's registration mail and the invite mail above may
        // not be logged yet when the snapshot below is taken. Poll for both: without them in the
        // window the two address assertions would pass because nothing had been written, not
        // because anything was redacted.
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline
                && !(capturedText().contains("template=verify") && capturedText().contains("template=invite"))) {
            Thread.sleep(50);
        }

        // --- now assert on what was actually captured --------------------------------------------
        String text = capturedText();

        // Vacuous-pass guards: the appender has to have seen real, request-driven work in the same
        // window, or "no secret appears" would prove nothing at all.
        assertThat(captured.list).as("captured log events").isNotEmpty();
        assertThat(text).as("captured logs include the Stripe-connect write, so the capture window "
                + "really covers the requests driven above").contains("box_stripe");

        assertThat(text).as("plaintext Stripe restricted key in logs").doesNotContain(RESTRICTED_KEY);
        assertThat(text).as("plaintext Stripe webhook secret in logs").doesNotContain(WEBHOOK_SECRET);
        assertThat(text).as("AES master key in logs").doesNotContain(ENC_KEY);
        assertThat(text).as("JWT signing secret in logs").doesNotContain(JWT_SECRET);
        assertThat(text).as("box-scoped JWT in logs").doesNotContain(boxToken);
        assertThat(text).as("session JWT in logs").doesNotContain(accessCookie.getValue());
        assertThat(text).as("refresh token in logs").doesNotContain(refreshCookie.getValue());
        assertThat(text).as("rotated refresh token in logs").doesNotContain(rotatedRefresh.getValue());
        assertThat(text).as("user password in logs").doesNotContain(PASSWORD);
        assertThat(text).as("raw invite token in logs").doesNotContain(inviteToken);
        assertThat(text).as("TV pairing secret in logs").doesNotContain(pairSecret);
        // Leaking this one forges every media URL on the platform, since nginx's secure_link
        // check is the only thing standing between a path and the file. Step 7 above drives a
        // response whose DTO runs through MediaSigner, so the signing path is really exercised.
        assertThat(text).as("media link-signing secret in logs").doesNotContain(MEDIA_LINK_SECRET);

        // --- M12c: PII, not credentials. Same standing-guarantee shape as the assertions above:
        // a future log line that writes a member's address fails the build.
        assertThat(text).as("the fixture's registration mail really ran inside the capture window, "
                + "so the address assertions below are not vacuous").contains("template=verify");
        assertThat(text).as("the invite mail really ran inside the capture window").contains("template=invite");
        assertThat(text).as("registered user's email address in logs").doesNotContain(email);
        assertThat(text).as("invitee's email address in logs").doesNotContain(inviteeEmail);
    }

    /** Everything the appender saw: formatted messages, arguments, and full throwable chains. */
    private String capturedText() {
        List<String> parts = new ArrayList<>();
        for (ILoggingEvent e : List.copyOf(captured.list)) {
            parts.add(e.getFormattedMessage());
            var t = e.getThrowableProxy();
            while (t != null) {
                parts.add(t.getClassName() + ": " + t.getMessage());
                for (var frame : t.getStackTraceElementProxyArray()) parts.add(frame.getSTEAsString());
                t = t.getCause();
            }
        }
        return String.join("\n", parts);
    }

    /** Stripe's documented webhook signing scheme — a pure local HMAC, no network involved. */
    private String signatureHeader(String payload, String secret) throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] hash = mac.doFinal((timestamp + "." + payload).getBytes(StandardCharsets.UTF_8));
        return "t=" + timestamp + ",v1=" + HexFormat.of().formatHex(hash);
    }

    /** @TenantId entities need an ambient box-scoped Authentication before they can be written. */
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }
}
