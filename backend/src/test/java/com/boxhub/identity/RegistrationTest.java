package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;

class RegistrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void registerCreatesUser() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content("""
                {"email":"reg1@test.io","password":"password123","name":"Reg One"}
                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("reg1@test.io"))
                .andExpect(jsonPath("$.id").exists());
    }

    @Test
    void duplicateEmailIs409() throws Exception {
        String body = """
                {"email":"dup@test.io","password":"password123","name":"Dup"}
                """;
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void shortPasswordIs400() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content("""
                {"email":"weak@test.io","password":"short","name":"Weak"}
                """))
                .andExpect(status().isBadRequest());
    }
}
