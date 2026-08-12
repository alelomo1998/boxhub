package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ErrorContractTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void validationErrorsListFields() throws Exception {
        // password is blank, not merely short: length is PasswordPolicy's job now (service layer,
        // not the DTO — see RegistrationTest.shortPasswordIsRejectedWithTheSpecificCodeNotAGenericValidationFailure),
        // so this still needs a DTO-level violation to keep exercising the multi-field-listing contract.
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"email":"not-an-email","password":"","name":""}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists())
                .andExpect(jsonPath("$.errors.name").exists());
    }
}
