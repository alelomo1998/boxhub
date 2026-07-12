package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TvAdminApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TvDeviceRepository devices;

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private UUID activeDevice(Box box, String name) {
        TvDevice d = new TvDevice();
        d.setBoxId(box.getId()); d.setName(name); d.setStatus("ACTIVE");
        d.setSecretHash("h");
        return devices.save(d).getId();
    }

    @Test
    void adminListsRenamesDeletesOwnDevices() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvm-a-" + n);
        String admin = boxToken("tvm-" + n + "@t.io", a, "BOX_ADMIN");
        UUID id = activeDevice(a, "Rig wall");

        mvc.perform(get("/api/box/tv").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Rig wall"))
                .andExpect(jsonPath("$[0].online").value(false));

        mvc.perform(patch("/api/box/tv/" + id).header("Authorization", "Bearer " + admin)
                .contentType(APPLICATION_JSON).content("{\"name\":\"Front desk\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Front desk"));

        mvc.perform(delete("/api/box/tv/" + id).header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());
        assertThat(devices.findById(id).orElseThrow().getStatus()).isEqualTo("REVOKED");
    }

    @Test
    void crossTenantDeniedEverywhere() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvx-a-" + n);
        Box b = newBox("tvx-b-" + n);
        String adminB = boxToken("tvxb-" + n + "@t.io", b, "BOX_ADMIN");
        UUID idA = activeDevice(a, "Box A TV");

        mvc.perform(get("/api/box/tv").header("Authorization", "Bearer " + adminB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + idA + "')]").isEmpty());
        mvc.perform(patch("/api/box/tv/" + idA).header("Authorization", "Bearer " + adminB)
                .contentType(APPLICATION_JSON).content("{\"name\":\"steal\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/box/tv/" + idA).header("Authorization", "Bearer " + adminB))
                .andExpect(status().isNotFound());
    }

    @Test
    void athleteDenied() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvr-a-" + n);
        String athlete = boxToken("tvr-" + n + "@t.io", a, "ATHLETE");
        mvc.perform(get("/api/box/tv").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    @Test
    void noAuthDenied() throws Exception {
        mvc.perform(get("/api/box/tv")).andExpect(status().isUnauthorized());
    }
}
