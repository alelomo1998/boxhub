package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;

class RegistrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
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
    void shortPasswordIs400() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"weak@test.io","password":"short","name":"Weak"}
                """))
                .andExpect(status().isBadRequest());
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
}
