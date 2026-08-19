package com.boxhub.security;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The staleness guard: the box a client BELIEVES is active, asserted against the box its token
 * actually carries. The active box is one cookie plus one localStorage key, and localStorage is
 * shared across tabs — so switching box in one tab silently repoints every other tab, whose next
 * write then lands in a box the user is not looking at.
 */
class BoxStalenessGuardTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;

    private String boxAToken;
    private UUID boxAId, boxBId;

    @BeforeEach
    void fixture() {
        long n = System.nanoTime();
        Box a = newBox("Stale A " + n, "stale-a-" + n);
        Box b = newBox("Stale B " + n, "stale-b-" + n);
        boxAId = a.getId();
        boxBId = b.getId();

        User u = authService.register("stale-" + n + "@t.io", "correct-horse-battery", "Stale U");
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(a);
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        boxAToken = tokenService.boxToken(u, memberships.save(m));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    @Test
    void aHeaderNamingAnotherBoxIsRejectedAsStale() throws Exception {
        mvc.perform(get("/api/box/current")
                        .header("Authorization", "Bearer " + boxAToken)
                        .header("X-Box-Id", boxBId.toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("STALE_BOX"));
    }

    @Test
    void aMatchingHeaderPassesThrough() throws Exception {
        mvc.perform(get("/api/box/current")
                        .header("Authorization", "Bearer " + boxAToken)
                        .header("X-Box-Id", boxAId.toString()))
                .andExpect(status().isOk());
    }

    @Test
    void noHeaderIsNoAssertionAndStillWorks() throws Exception {
        // API clients, the TV surface and every existing e2e spec send no header. The guard is an
        // assertion the client opts into, never a new requirement.
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + boxAToken))
                .andExpect(status().isOk());
    }

    @Test
    void anUnparseableHeaderIsAlsoStaleRatherThanA500() throws Exception {
        mvc.perform(get("/api/box/current")
                        .header("Authorization", "Bearer " + boxAToken)
                        .header("X-Box-Id", "not-a-uuid"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("STALE_BOX"));
    }
}
