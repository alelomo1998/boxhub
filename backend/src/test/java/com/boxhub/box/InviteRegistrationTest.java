package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.RefreshTokenService;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * An invite mailed to an address, holding an unguessable 32-byte token, is proof the holder
 * reads that inbox — the same proof clicking the verification email buys (see
 * AuthService.completeReset). Registering through a valid, unexpired invite issued to the SAME
 * email must verify on the spot and skip the separate verify mail; anything else must behave
 * exactly like registration without a token — never fail, never leak whether the token was good.
 */
class InviteRegistrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired InviteRepository invites;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @Autowired PlatformTransactionManager txManager;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    /** Mints a real invite the way InviteAdminController does, box-scoped via an admin token. */
    private String createInviteLink(String email) throws Exception {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Invite Reg Box " + n);
        box.setSlug("ireg-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);
        User admin = authService.register("iradm-" + n + "@t.io", "correct-horse-battery", "Adm");
        Membership m = new Membership();
        m.setUser(admin);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);
        String adminToken = tokenService.boxToken(admin, m);

        String body = mvc.perform(post("/api/box/invites").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"email\":\"" + email + "\",\"role\":\"ATHLETE\"}"))
                .andReturn().getResponse().getContentAsString();
        return om.readTree(body).get("link").asText().substring("/join/".length());
    }

    /** Registration itself gets NO Authorization header — a real public registration is
     *  tenant-less, which is exactly the case that would trip a JPQL/derived Invite lookup
     *  (the @TenantId filter would silently scope it to nothing). */
    private void register(String email, String token) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery","name":"Invited","inviteToken":"%s"}
                        """.formatted(email, token)))
                .andExpect(status().isCreated());
    }

    @Test
    void validInviteForTheSameEmailVerifiesAndSkipsTheMailAndLoginWorks() throws Exception {
        String email = "invited-" + System.nanoTime() + "@t.io";
        String token = createInviteLink(email);

        register(email, token);

        User u = users.findByEmail(email).orElseThrow();
        assertThat(u.isEmailVerified()).isTrue();
        verify(mailer, never()).send(eq(email), any(), eq("verify"), any());

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(email)))
                .andExpect(status().isOk());
    }

    @Test
    void validTokenForADifferentEmailDoesNotVerify() throws Exception {
        String invitedEmail = "target-" + System.nanoTime() + "@t.io";
        String token = createInviteLink(invitedEmail);
        String impostorEmail = "impostor-" + System.nanoTime() + "@t.io";

        register(impostorEmail, token);

        User u = users.findByEmail(impostorEmail).orElseThrow();
        assertThat(u.isEmailVerified()).isFalse();
        verify(mailer).send(eq(impostorEmail), any(), eq("verify"), any());
    }

    @Test
    void garbageTokenFallsBackToNormalVerificationNoException() throws Exception {
        String email = "garbage-" + System.nanoTime() + "@t.io";

        register(email, "not-a-real-token-at-all");

        User u = users.findByEmail(email).orElseThrow();
        assertThat(u.isEmailVerified()).isFalse();
        verify(mailer).send(eq(email), any(), eq("verify"), any());
    }

    @Test
    void expiredTokenFallsBackToNormalVerification() throws Exception {
        String invitedEmail = "expired-" + System.nanoTime() + "@t.io";
        String token = createInviteLink(invitedEmail);
        Invite inv = invites.findByTokenHash(RefreshTokenService.sha256(token)).orElseThrow();
        inv.setExpiresAt(Instant.now().minusSeconds(60));
        invites.save(inv);

        register(invitedEmail, token);

        assertThat(users.findByEmail(invitedEmail).orElseThrow().isEmailVerified()).isFalse();
        verify(mailer).send(eq(invitedEmail), any(), eq("verify"), any());
    }

    @Test
    void acceptedTokenFallsBackToNormalVerification() throws Exception {
        String invitedEmail = "accepted-" + System.nanoTime() + "@t.io";
        String token = createInviteLink(invitedEmail);
        Invite inv = invites.findByTokenHash(RefreshTokenService.sha256(token)).orElseThrow();
        new TransactionTemplate(txManager).executeWithoutResult(s ->
                assertThat(invites.burnIfUnaccepted(inv.getId(), Instant.now())).isEqualTo(1));

        register(invitedEmail, token);

        assertThat(users.findByEmail(invitedEmail).orElseThrow().isEmailVerified()).isFalse();
        verify(mailer).send(eq(invitedEmail), any(), eq("verify"), any());
    }
}
