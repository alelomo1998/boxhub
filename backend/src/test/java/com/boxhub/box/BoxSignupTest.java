package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxSignupTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired PlatformSettings settings;
    @Autowired BoxWaitlistRepository waitlist;
    @Autowired BoxSignupService boxSignup;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    @BeforeEach
    void stubMailer() { when(mailer.link(any())).thenReturn("http://localhost/x"); }

    @AfterEach
    void restoreSettings() {
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL");
        settings.set(PlatformSettings.MAX_BOXES, "100");
    }

    private org.springframework.test.web.servlet.ResultActions signup(String boxName, String email) throws Exception {
        return mvc.perform(post("/api/auth/signup-box").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"boxName":"%s","name":"Owner","email":"%s","password":"correct-horse-battery"}
                """.formatted(boxName, email)));
    }

    @Test
    void approvalModeCreatesAPendingBoxWithAnUnverifiedOwnerAdmin() throws Exception {
        String email = "owner-" + System.nanoTime() + "@t.io";
        signup("Iron Temple", email)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email));

        var owner = users.findByEmail(email).orElseThrow();
        assertThat(owner.isEmailVerified()).isFalse();
        var mems = memberships.findByUserIdWithBox(owner.getId());
        assertThat(mems).hasSize(1);
        assertThat(mems.get(0).getRole()).isEqualTo("BOX_ADMIN");
        assertThat(mems.get(0).getBox().getStatus()).isEqualTo("PENDING");
        assertThat(mems.get(0).getBox().getSlug()).startsWith("iron-temple");
    }

    @Test
    void openModeCreatesAnActiveBox() throws Exception {
        settings.set(PlatformSettings.SIGNUP_MODE, "OPEN");
        String email = "open-" + System.nanoTime() + "@t.io";
        signup("Open Gym", email).andExpect(status().isCreated());

        var owner = users.findByEmail(email).orElseThrow();
        assertThat(memberships.findByUserIdWithBox(owner.getId()).get(0).getBox().getStatus())
                .isEqualTo("ACTIVE");
    }

    @Test
    void slugCollisionsGetASuffix() throws Exception {
        String e1 = "slug1-" + System.nanoTime() + "@t.io";
        String e2 = "slug2-" + System.nanoTime() + "@t.io";
        signup("Same Name Box", e1).andExpect(status().isCreated());
        signup("Same Name Box", e2).andExpect(status().isCreated());

        var second = users.findByEmail(e2).orElseThrow();
        String slug2 = memberships.findByUserIdWithBox(second.getId()).get(0).getBox().getSlug();
        assertThat(slug2).matches("same-name-box-\\d+");
    }

    @Test
    void anExistingEmailGetsTheSameResponseAndNoBox() throws Exception {
        String email = "taken-" + System.nanoTime() + "@t.io";
        signup("First Box", email).andExpect(status().isCreated());
        long boxCount = boxes.count();

        // Anti-enumeration: identical 201 shape, no second box, real owner gets a warning mail.
        signup("Second Box", email)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email));
        assertThat(boxes.count()).isEqualTo(boxCount);
    }

    @Test
    void atCapSignupReportsFullAndCreatesNothing() throws Exception {
        settings.set(PlatformSettings.MAX_BOXES, "0");
        String email = "full-" + System.nanoTime() + "@t.io";
        signup("Overflow Box", email)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.full").value(true));
        assertThat(users.findByEmail(email)).isEmpty();
    }

    @Test
    void closedModeReportsFull() throws Exception {
        settings.set(PlatformSettings.SIGNUP_MODE, "CLOSED");
        signup("Closed Box", "closed-" + System.nanoTime() + "@t.io")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.full").value(true));
    }

    @Test
    void waitlistAlways202AndSwallowsDuplicates() throws Exception {
        String email = "wl-" + System.nanoTime() + "@t.io";
        String body = """
                {"email":"%s","boxName":"Waiting Gym"}
                """.formatted(email);
        mvc.perform(post("/api/auth/waitlist").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());
        mvc.perform(post("/api/auth/waitlist").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());
        assertThat(waitlist.findAllByOrderByCreatedAtAsc().stream()
                .filter(w -> w.getEmail().equals(email))).hasSize(1);
    }

    @Test
    void concurrentWaitlistJoinForTheSameEmailBothSucceedExactlyOneRowExists() throws Exception {
        // Real double-submit: two threads call joinWaitlist() for the same email at the same
        // instant, against real Postgres. One wins the unique(email) constraint; the loser must
        // still return normally (waitlist contract is ALWAYS 202), not blow up with
        // UnexpectedRollbackException from a rollback-only transaction. Looped with a fresh email
        // each iteration because the race is timing-dependent.
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 5; i++) {
                String email = "race-" + System.nanoTime() + "@t.io";
                CyclicBarrier barrier = new CyclicBarrier(2);

                Callable<Void> attempt = () -> {
                    barrier.await();
                    boxSignup.joinWaitlist(email, "Race Gym");
                    return null;
                };

                List<Future<Void>> futures = List.of(pool.submit(attempt), pool.submit(attempt));
                // .get() rethrows any exception the call raised — this is the assertion that
                // neither thread saw the 500 (UnexpectedRollbackException / JpaSystemException).
                futures.forEach(f -> {
                    try {
                        f.get();
                    } catch (Exception ex) {
                        throw new RuntimeException(ex);
                    }
                });

                assertThat(waitlist.findAllByOrderByCreatedAtAsc().stream()
                        .filter(w -> w.getEmail().equals(email))).hasSize(1);
            }
        } finally {
            pool.shutdown();
        }
    }

    @Test
    void signupModeEndpointReportsOpenness() throws Exception {
        mvc.perform(get("/api/auth/signup-mode"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(true)); // APPROVAL + under cap = open form

        settings.set(PlatformSettings.SIGNUP_MODE, "CLOSED");
        mvc.perform(get("/api/auth/signup-mode"))
                .andExpect(jsonPath("$.open").value(false));
    }
}
