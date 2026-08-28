package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MyThreadApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    String aToken, bToken, foreignToken;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box box = newBox("Thr " + n, "thr-" + n);
        Box other = newBox("Oth " + n, "oth-" + n);

        User a = authService.register("ta-" + n + "@t.io", "correct-horse-battery", "Ada");
        User b = authService.register("tb-" + n + "@t.io", "correct-horse-battery", "Bo");
        User f = authService.register("tf-" + n + "@t.io", "correct-horse-battery", "Fern");
        aToken = tokenService.boxToken(a, member(a, box, "ATHLETE"));
        bToken = tokenService.boxToken(b, member(b, box, "ATHLETE"));
        foreignToken = tokenService.boxToken(f, member(f, other, "ATHLETE"));
    }

    /** HAPPY */
    @Test
    void memberSendsAndReadsBackTheirOwnThread() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + aToken)
                        .content("{\"body\":\"Is the 6am on tomorrow?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderSide").value("MEMBER"));

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + aToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(1))
                .andExpect(jsonPath("$.messages[0].body").value("Is the 6am on tomorrow?"));
    }

    /** HAPPY — empty state is 200 with an empty list, never 204 (spec §6). */
    @Test
    void memberWithNoThreadGets200AndAnEmptyList() throws Exception {
        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + bToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(0));
    }

    /** AUTH-DENIED */
    @Test
    void anonymousIsRejected() throws Exception {
        mvc.perform(get("/api/box/me/thread")).andExpect(status().isUnauthorized());
    }

    /**
     * CROSS-MEMBER-DENIED — the guarantee @TenantId does not give us (spec §4).
     * Negative control: drop the membershipId predicate in MessageThreadRepository and this fails.
     */
    @Test
    void memberBNeverSeesMemberAsMessages() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + aToken)
                .content("{\"body\":\"ADA-PRIVATE-MARKER\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + bToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages.length()").value(0))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("ADA-PRIVATE-MARKER"))));
    }

    /** CROSS-TENANT-DENIED */
    @Test
    void anotherBoxSeesNothingOfThisBox() throws Exception {
        mvc.perform(post("/api/box/me/thread/messages").contentType(APPLICATION_JSON)
                .header("Authorization", "Bearer " + aToken)
                .content("{\"body\":\"ADA-PRIVATE-MARKER\"}")).andExpect(status().isOk());

        mvc.perform(get("/api/box/me/thread").header("Authorization", "Bearer " + foreignToken))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("ADA-PRIVATE-MARKER"))));
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
}
