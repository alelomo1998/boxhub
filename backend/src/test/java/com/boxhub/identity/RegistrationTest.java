package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;

class RegistrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    // Same @MockitoBean-returns-null-for-link() issue as VerificationTest — see the note there.
    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    @Test
    void registerCreatesUser() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"reg1@test.io","password":"correct-horse-battery","name":"Reg One"}
                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("reg1@test.io"))
                .andExpect(jsonPath("$.id").exists());
    }

    @Test
    void duplicateEmailReturns201AndWarnsTheRealOwnerInsteadOfLeakingViaA409() throws Exception {
        String body = """
                {"email":"dup@test.io","password":"correct-horse-battery","name":"Dup"}
                """;
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"dup@test.io","password":"someone-elses-password","name":"Impostor"}
                """))
                .andExpect(status().isCreated());

        verify(mailer).send(eq("dup@test.io"), any(), eq("register-attempt"), any());
    }

    @Test
    void shortPasswordIsRejectedWithTheSpecificCodeNotAGenericValidationFailure() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"weak@test.io","password":"short","name":"Weak"}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("PASSWORD_TOO_SHORT"));
    }

    @Test
    void caseVariantDuplicateEmailAlsoReturns201NotConflict() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"CaseDup@test.io","password":"correct-horse-battery","name":"Case Dup"}
                """))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"casedup@test.io","password":"correct-horse-battery","name":"Case Dup 2"}
                """))
                .andExpect(status().isCreated());

        verify(mailer).send(eq("casedup@test.io"), any(), eq("register-attempt"), any());
    }

    @Test
    void concurrentRegisterForTheSameFreshEmailBothReturnTheSameUserNoExceptionEscapes() throws Exception {
        // Real double-click: two threads call register() for the same brand-new email at the
        // same instant, against real Postgres. Both pass AuthService's "not taken yet" read,
        // then race users.email's unique constraint — one wins the insert, the other must recover
        // by re-fetching the winner's row, not blow up with JpaSystemException ("current
        // transaction is aborted") from statements run inside the now-rollback-only transaction.
        // Looped with a fresh email each iteration because the race is timing-dependent.
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 5; i++) {
                String email = "concurrent-reg-" + System.nanoTime() + "@t.io";
                CyclicBarrier barrier = new CyclicBarrier(2);

                Callable<User> attempt = () -> {
                    barrier.await();
                    return authService.register(email, "correct-horse-battery", "Double Click");
                };

                List<Future<User>> futures = List.of(pool.submit(attempt), pool.submit(attempt));
                List<User> results = futures.stream().map(f -> {
                    try {
                        return f.get();
                    } catch (Exception ex) {
                        throw new RuntimeException(ex);
                    }
                }).collect(Collectors.toList());

                assertThat(results.get(1).getId()).isEqualTo(results.get(0).getId());
            }
        } finally {
            pool.shutdown();
        }
    }
}
