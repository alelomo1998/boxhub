package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProfileApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String alice, bob, stranger;
    UUID aliceMid;
    UUID boxAId;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("Pr A " + n, "pr-a-" + n);
        Box b = newBox("Pr B " + n, "pr-b-" + n);
        boxAId = a.getId();
        var am = member("pra-" + n + "@t.io", a, "ATHLETE");
        alice = am.token; aliceMid = am.mid;
        bob = member("prb-" + n + "@t.io", a, "ATHLETE").token;
        stranger = member("prs-" + n + "@t.io", b, "ATHLETE").token;
    }

    private record M(String token, UUID mid) {}

    private Box newBox(String name, String slug) {
        Box x = new Box(); x.setName(name); x.setSlug(slug); x.setTimezone("Europe/Rome");
        return boxes.save(x);
    }

    private M member(String email, Box box, String role) {
        User u = authService.register(email, "correct-horse-battery", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return new M(tokenService.boxToken(u, m), m.getId());
    }

    @Test
    void privateProfileMasksStatsButKeepsPhotoAndName() throws Exception {
        // Alice goes private
        mvc.perform(patch("/api/box/me/profile").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + alice)
                        .content("{\"isPrivate\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isPrivate").value(true));

        // Bob sees photo+name, no stats
        mvc.perform(get("/api/box/members/" + aliceMid + "/profile").header("Authorization", "Bearer " + bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").isNotEmpty())
                .andExpect(jsonPath("$.benchmarks").doesNotExist())
                .andExpect(jsonPath("$.liftPrs").doesNotExist())
                .andExpect(jsonPath("$.streakWeeks").doesNotExist());

        // Alice still sees her own stats
        mvc.perform(get("/api/box/members/" + aliceMid + "/profile").header("Authorization", "Bearer " + alice))
                .andExpect(jsonPath("$.me").value(true))
                .andExpect(jsonPath("$.liftPrs").isArray());
    }

    @Test
    void publicProfileShowsStats() throws Exception {
        mvc.perform(get("/api/box/members/" + aliceMid + "/profile").header("Authorization", "Bearer " + bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liftPrs").isArray())
                .andExpect(jsonPath("$.streakWeeks").isNumber());
    }

    @Test
    void avatarMustBeOwnBoxMediaPath() throws Exception {
        mvc.perform(put("/api/box/me/avatar").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + alice)
                        .content("{\"path\":\"/media/" + UUID.randomUUID() + "/x.png\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/box/me/avatar").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + alice)
                        .content("{\"path\":\"/media/" + boxAId + "/x.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarPath", org.hamcrest.Matchers.startsWith("/media/")));
    }

    @Test
    void crossTenantProfileIs404() throws Exception {
        mvc.perform(get("/api/box/members/" + aliceMid + "/profile").header("Authorization", "Bearer " + stranger))
                .andExpect(status().isNotFound());
    }
}
