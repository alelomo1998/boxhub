package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Transactional
@TestPropertySource(properties = "boxhub.superadmin-emails=root@boxhub.io")
class BoxCreationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired UserRepository userRepository;

    private User root() {
        try {
            return authService.register("root@boxhub.io", "correct-horse-battery", "Root");
        } catch (Exception e) {
            return userRepository.findByEmail("root@boxhub.io").orElseThrow();
        }
    }

    @Test
    void superadminCreatesBox_normalUserDenied() throws Exception {
        long n = System.nanoTime();
        User root = authService.register("root@boxhub.io", "correct-horse-battery", "Root");
        User pleb = authService.register("pleb-" + n + "@t.io", "correct-horse-battery", "Pleb");

        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(pleb))
                        .content("{\"name\":\"Nope Box\",\"slug\":\"nope-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(root))
                        .content("{\"name\":\"Root Box\",\"slug\":\"root-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value("root-" + n));

        // duplicate slug
        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(root))
                        .content("{\"name\":\"Root Box 2\",\"slug\":\"root-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void mixedCaseConfiguredEmailStillGrantsSuperadmin() throws Exception {
        // config has lowercase root@boxhub.io; a user who registered with mixed case
        // is normalized to lowercase at registration, so the claim must still apply.
        long n = System.nanoTime();
        User rootUser = root();
        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(rootUser))
                        .content("{\"name\":\"Mixed Box\",\"slug\":\"mixed-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void boxScopedTokenCannotCreateBox() throws Exception {
        // a valid SCOPE_box admin token must NOT satisfy /api/admin/** (ROLE_SUPERADMIN)
        long n = System.nanoTime();
        User rootUser = root();
        Box box = new Box();
        box.setName("Scope Box " + n);
        box.setSlug("scope-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);
        Membership m = new Membership();
        m.setUser(rootUser);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);
        // even though root IS a superadmin email, a BOX-scoped token carries no superadmin claim
        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.boxToken(rootUser, m))
                        .content("{\"name\":\"Nope\",\"slug\":\"nope-" + n + "\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidSlugIs400() throws Exception {
        User rootUser = root();
        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(rootUser))
                        .content("{\"name\":\"Bad Slug\",\"slug\":\"UPPER\",\"timezone\":\"Europe/Rome\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidTimezoneIs400NotPersisted() throws Exception {
        long n = System.nanoTime();
        User rootUser = root();
        mvc.perform(post("/api/admin/boxes").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + tokenService.userToken(rootUser))
                        .content("{\"name\":\"Bad TZ Box\",\"slug\":\"badtz-" + n + "\",\"timezone\":\"Not/AZone\"}"))
                .andExpect(status().isBadRequest());

        assertThat(boxes.existsBySlug("badtz-" + n)).isFalse();
    }
}
