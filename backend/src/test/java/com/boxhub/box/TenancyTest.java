package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TenancyTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    User alice;           // member of boxA only
    Box boxA, boxB;
    Membership aliceInA;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        alice = authService.register("alice-" + n + "@t.io", "password123", "Alice");
        boxA = newBox("Box A " + n, "box-a-" + n);
        boxB = newBox("Box B " + n, "box-b-" + n);
        aliceInA = new Membership();
        aliceInA.setUser(alice);
        aliceInA.setBox(boxA);
        aliceInA.setRole("ATHLETE");
        memberships.save(aliceInA);
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    @Test
    void meReturnsProfileAndMemberships() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(alice.getEmail()))
                .andExpect(jsonPath("$.memberships[0].role").value("ATHLETE"));
    }

    @Test
    void meWithoutTokenIs401() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void boxTokenForOwnBoxWorks() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken)
                        .content("{\"boxId\":\"" + boxA.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void boxTokenForForeignBoxIs403_crossTenantDenial() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken)
                        .content("{\"boxId\":\"" + boxB.getId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void boxCurrentReturnsOnlyTokenBox() throws Exception {
        String boxToken = tokenService.boxToken(alice, aliceInA);
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(boxA.getId().toString()))
                .andExpect(jsonPath("$.role").value("ATHLETE"));
    }

    @Test
    void boxCurrentWithUserScopedTokenIs403() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());
    }
}
