package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;

/**
 * The audit row is written INSIDE the same transaction as the lifecycle change
 * ({@link BoxLifecycleTx}), so {@link #capReachedApproveWritesNoAuditRow} is the load-bearing
 * proof here: a rolled-back transition must leave no row claiming it happened.
 */
@TestPropertySource(properties = "boxhub.superadmin-emails=root@boxhub.io")
class SuperadminAuditTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired PlatformSettings settings;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;
    @Autowired SuperadminAuditRepository auditRepo;
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

    private List<SuperadminAudit> rowsForBox(java.util.UUID boxId) {
        return auditRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(a -> boxId.equals(a.getBoxId())).toList();
    }

    @Test
    void approveWritesOneRow() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("PENDING", "owner-" + n + "@t.io");
        settings.set(PlatformSettings.MAX_BOXES, "1000000");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk());

        List<SuperadminAudit> rows = rowsForBox(box.getId());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAction()).isEqualTo("APPROVE");
        assertThat(rows.get(0).getActorEmail()).isEqualTo("root@boxhub.io");
        assertThat(rows.get(0).getBoxId()).isEqualTo(box.getId());
    }

    @Test
    void rejectWritesOneRow() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("PENDING", "owner-" + n + "@t.io");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/reject")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk());

        List<SuperadminAudit> rows = rowsForBox(box.getId());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAction()).isEqualTo("REJECT");
        assertThat(rows.get(0).getActorEmail()).isEqualTo("root@boxhub.io");
    }

    @Test
    void suspendWritesOneRow() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("ACTIVE", "owner-" + n + "@t.io");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/suspend")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk());

        List<SuperadminAudit> rows = rowsForBox(box.getId());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAction()).isEqualTo("SUSPEND");
        assertThat(rows.get(0).getActorEmail()).isEqualTo("root@boxhub.io");
    }

    @Test
    void reactivateWritesOneRow() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("SUSPENDED", "owner-" + n + "@t.io");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/reactivate")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk());

        List<SuperadminAudit> rows = rowsForBox(box.getId());
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getAction()).isEqualTo("REACTIVATE");
        assertThat(rows.get(0).getActorEmail()).isEqualTo("root@boxhub.io");
    }

    @Test
    void settingsChangeWritesOneRowWithNoBox() throws Exception {
        String token = rootToken();
        long before = auditRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(a -> "SETTINGS_CHANGE".equals(a.getAction())).count();

        mvc.perform(patch("/api/admin/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + token)
                        .content("{\"signupMode\":\"OPEN\",\"maxBoxes\":7}"))
                .andExpect(status().isOk());

        List<SuperadminAudit> settingsRows = auditRepo.findAllByOrderByCreatedAtDesc().stream()
                .filter(a -> "SETTINGS_CHANGE".equals(a.getAction())).toList();
        assertThat(settingsRows).hasSize((int) before + 1);
        assertThat(settingsRows.get(0).getBoxId()).isNull();
        assertThat(settingsRows.get(0).getActorEmail()).isEqualTo("root@boxhub.io");
    }

    // ---- the load-bearing rollback proof ----

    @Test
    void capReachedApproveWritesNoAuditRow() throws Exception {
        long n = System.nanoTime();
        Box box = boxWithOwner("PENDING", "owner-" + n + "@t.io");
        settings.set(PlatformSettings.MAX_BOXES, "0");

        mvc.perform(post("/api/admin/boxes/" + box.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("CAP_REACHED"));

        // the whole transaction rolled back — status flip AND the audit insert with it
        assertThat(boxes.findById(box.getId()).orElseThrow().getStatus()).isEqualTo("PENDING");
        assertThat(rowsForBox(box.getId())).isEmpty();
    }

    // ---- GET /api/admin/audit ----

    @Test
    void auditListIsSuperadminOnly() throws Exception {
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

        mvc.perform(get("/api/admin/audit").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void auditListRejectsUnauthenticated() throws Exception {
        mvc.perform(get("/api/admin/audit")).andExpect(status().isUnauthorized());
    }

    @Test
    void auditListIsNewestFirst() throws Exception {
        long n = System.nanoTime();
        Box first = boxWithOwner("PENDING", "owner-a-" + n + "@t.io");
        settings.set(PlatformSettings.MAX_BOXES, "1000000");
        mvc.perform(post("/api/admin/boxes/" + first.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk());

        Box second = boxWithOwner("PENDING", "owner-b-" + n + "@t.io");
        mvc.perform(post("/api/admin/boxes/" + second.getId() + "/approve")
                        .header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk());

        mvc.perform(get("/api/admin/audit").header("Authorization", "Bearer " + rootToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].boxId").value(second.getId().toString()))
                .andExpect(jsonPath("$[1].boxId").value(first.getId().toString()));
    }
}
