package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.display.TvDevice;
import com.boxhub.display.TvDeviceRepository;
import com.boxhub.display.TvStreamService;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.PlatformSettings;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "boxhub.superadmin-emails=root@boxhub.io")
class SuperadminBoxApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired BoxWaitlistRepository waitlist;
    @Autowired PlatformSettings settings;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;
    @Autowired TvDeviceRepository devices;
    @Autowired TvStreamService tvStream;
    @MockitoBean Mailer mailer;

    @BeforeEach
    void stubMailer() { when(mailer.link(any())).thenReturn("http://localhost/x"); }

    @AfterEach
    void restoreSettings() {
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL");
        settings.set(PlatformSettings.MAX_BOXES, "100");
    }

    private User superadmin() {
        try {
            return authService.register("root@boxhub.io", "correct-horse-battery", "Root");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private String rootToken() { return tokenService.userToken(superadmin()); }

    /** name, slug uniquified per call; status defaults to PENDING (BOX_ADMIN owner attached). */
    private Box boxWithOwner(String status, String ownerEmail) {
        long n = System.nanoTime();
        Box b = new Box();
        b.setName("Box " + n);
        b.setSlug("box-" + n);
        b.setTimezone("Europe/Rome");
        b.setStatus(status);
        boxes.save(b);
        User owner = authService.register(ownerEmail, "correct-horse-battery", "Owner");
        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(b);
        m.setRole("BOX_ADMIN");
        memberships.save(m);
        return b;
    }

    // ---- approve ----

    @Test
    void approvePendingBoxActivatesAndMailsOwner() throws Exception {
        long n = System.nanoTime();
        String ownerEmail = "owner-" + n + "@t.io";
        Box box = boxWithOwner("PENDING", ownerEmail);

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        Box reloaded = boxes.findById(box.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo("ACTIVE");
        verify(mailer).send(eq(ownerEmail), any(), eq("box-approved"), any());
    }

    @Test
    void approveNonPendingBoxIs409NoMail() throws Exception {
        long n = System.nanoTime();
        String ownerEmail = "owner-" + n + "@t.io";
        Box box = boxWithOwner("ACTIVE", ownerEmail);

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("BAD_STATE"));

        // registering the fixture owner already sent a verification mail — verify no
        // *approval* mail went out rather than no interactions at all
        verify(mailer, org.mockito.Mockito.never()).send(any(), any(), eq("box-approved"), any());
    }

    @Test
    void approvePastCapIs409CapReached() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("PENDING", "owner-" + n + "@t.io");
        settings.set(PlatformSettings.MAX_BOXES, "0");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("CAP_REACHED"));
    }

    // ---- reject ----

    @Test
    void rejectPendingBoxMailsOwner() throws Exception {
        long n = System.nanoTime();
        String ownerEmail = "owner-" + n + "@t.io";
        Box box = boxWithOwner("PENDING", ownerEmail);

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/reject")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));

        assertThat(boxes.findById(box.getId()).orElseThrow().getStatus()).isEqualTo("REJECTED");
        verify(mailer).send(eq(ownerEmail), any(), eq("box-rejected"), any());
    }

    // ---- suspend / reactivate ----

    @Test
    void suspendDisconnectsLiveTvEmitterAndFlipsStatus() throws Exception {
        // Cheapest HONEST proof: ResponseBodyEmitter.complete() sets its internal `complete`
        // flag unconditionally (independent of whether the real servlet async handler is
        // wired), and every subsequent send() asserts that flag and throws IllegalStateException
        // — that assertion is SseEmitter's own public contract, not a mock-framework quirk, so
        // it's a fully deterministic proof of the connection being torn down by suspend.
        long n = System.nanoTime();
        Box box = boxWithOwner("ACTIVE", "owner-" + n + "@t.io");
        TvDevice d = new TvDevice();
        d.setBoxId(box.getId());
        d.setName("TV");
        d.setStatus("ACTIVE");
        d.setSecretHash("h");
        devices.save(d);
        SseEmitter emitter = tvStream.connect(d);

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/suspend")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED"));

        assertThat(boxes.findById(box.getId()).orElseThrow().getStatus()).isEqualTo("SUSPENDED");
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> emitter.send(SseEmitter.event().name("x").data("y")))
                .as("TV's SSE emitter should already be completed by the suspend")
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void reactivateSuspendedBox() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("SUSPENDED", "owner-" + n + "@t.io");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/reactivate")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        assertThat(boxes.findById(box.getId()).orElseThrow().getStatus()).isEqualTo("ACTIVE");
    }

    // ---- list ----

    @Test
    void listFiltersByStatusAndCarriesOwnerEmail() throws Exception {
        long n = System.nanoTime();
        String ownerEmail = "owner-" + n + "@t.io";
        Box pending = boxWithOwner("PENDING", ownerEmail);
        boxWithOwner("ACTIVE", "other-" + n + "@t.io");

        mvc.perform(get("/api/admin/boxes").param("status", "PENDING")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + pending.getId() + "')].ownerEmail").value(ownerEmail))
                .andExpect(jsonPath("$[?(@.status=='ACTIVE')]").isEmpty());
    }

    // ---- waitlist ----

    @Test
    void waitlistReturnsCapturedRows() throws Exception {
        long n = System.nanoTime();
        BoxWaitlist row = new BoxWaitlist();
        row.setEmail("wait-" + n + "@t.io");
        row.setBoxName("Waity Box");
        waitlist.save(row);

        mvc.perform(get("/api/admin/waitlist")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.email=='wait-" + n + "@t.io')].boxName").value("Waity Box"));
    }

    // ---- settings ----

    @Test
    void settingsGetReturnsSeededValues() throws Exception {
        mvc.perform(get("/api/admin/settings")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signupMode").value("APPROVAL"))
                .andExpect(jsonPath("$.maxBoxes").value(100));
    }

    @Test
    void settingsPatchFlipsSignupModeAndMaxBoxes() throws Exception {
        mvc.perform(patch("/api/admin/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + rootToken())
                        .content("{\"signupMode\":\"OPEN\",\"maxBoxes\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signupMode").value("OPEN"))
                .andExpect(jsonPath("$.maxBoxes").value(5));

        assertThat(settings.signupMode()).isEqualTo("OPEN");
        assertThat(settings.maxBoxes()).isEqualTo(5);
    }

    @Test
    void settingsPatchBadSignupModeIs400() throws Exception {
        mvc.perform(patch("/api/admin/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + rootToken())
                        .content("{\"signupMode\":\"NONSENSE\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void settingsPatchNegativeMaxBoxesIs400() throws Exception {
        mvc.perform(patch("/api/admin/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + rootToken())
                        .content("{\"maxBoxes\":-1}"))
                .andExpect(status().isBadRequest());
    }

    // ---- role-denied / unauthenticated ----

    @Test
    void everyEndpointDeniesBoxAdminToken() throws Exception {
        long n = System.nanoTime();
        User owner = authService.register("badmin-" + n + "@t.io", "correct-horse-battery", "Owner");
        Box box = new Box();
        box.setName("Denied Box " + n);
        box.setSlug("denied-" + n);
        box.setTimezone("Europe/Rome");
        box.setStatus("PENDING");
        boxes.save(box);
        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);
        String boxToken = tokenService.boxToken(owner, m);

        mvc.perform(get("/api/admin/boxes").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/approve").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/reject").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/suspend").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/reactivate").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/waitlist").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/settings").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + boxToken).content("{\"maxBoxes\":5}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void everyEndpointRejectsUnauthenticated() throws Exception {
        long n = System.nanoTime();
        java.util.UUID randomId = java.util.UUID.randomUUID();

        // POSTs/PATCHes need .with(csrf()) so the CSRF filter (which fires before auth for a
        // header-less write) doesn't mask the 401 behind its own 403 — see SecurityConfig's
        // csrfRequired matcher.
        mvc.perform(get("/api/admin/boxes")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/boxes/" + randomId + "/approve").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/boxes/" + randomId + "/reject").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/boxes/" + randomId + "/suspend").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/boxes/" + randomId + "/reactivate").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/waitlist")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/settings")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/admin/settings").with(csrf()).contentType(APPLICATION_JSON).content("{\"maxBoxes\":5}"))
                .andExpect(status().isUnauthorized());
    }
}
