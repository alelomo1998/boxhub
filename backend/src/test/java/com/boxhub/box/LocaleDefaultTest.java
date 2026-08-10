package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * M13a T8: {@code users.locale} defaults from {@code Accept-Language} at registration; an invited
 * member inherits {@code boxes.locale} instead (spec §3 "Decided — where locale lives" — a box
 * sets its language once). {@link #userLocaleRoundTripsThroughTheEntityMapping} is also the
 * negative control named in the task's verification bar: it must fail if {@code locale} is
 * dropped from {@code User}'s entity mapping (verified by temporarily marking the field
 * {@code @Transient} and re-running — see the task report, not committed).
 */
class LocaleDefaultTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ObjectMapper om;
    @PersistenceContext EntityManager em;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    @BeforeEach
    void stubMailerLink() {
        lenient().when(mailer.link(any())).thenAnswer(inv -> "https://boxhub.test" + inv.getArgument(0, String.class));
    }

    @Test
    void userLocaleRoundTripsThroughTheEntityMapping() {
        User u = new User();
        u.setEmail("locale-rt-" + System.nanoTime() + "@t.io");
        u.setPasswordHash("x");
        u.setName("Locale RT");
        u.setLocale("it");
        User saved = users.saveAndFlush(u);
        em.clear(); // detach — force a genuine DB re-read, not the first-level cache echoing "it" back

        User reloaded = users.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getLocale()).isEqualTo("it");
    }

    @Test
    void boxLocaleRoundTripsThroughTheEntityMapping() {
        Box b = new Box();
        b.setName("Locale RT Box");
        b.setSlug("locale-rt-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        b.setLocale("it");
        Box saved = boxes.saveAndFlush(b);
        em.clear();

        Box reloaded = boxes.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getLocale()).isEqualTo("it");
    }

    @Test
    void unsetLocaleDefaultsToEnglishForBothEntities() {
        User u = new User();
        u.setEmail("locale-default-" + System.nanoTime() + "@t.io");
        u.setPasswordHash("x");
        u.setName("No Locale Set");
        assertThat(users.saveAndFlush(u).getLocale()).isEqualTo("en"); // never called setLocale

        Box b = new Box();
        b.setName("Default Locale Box");
        b.setSlug("default-locale-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        assertThat(boxes.saveAndFlush(b).getLocale()).isEqualTo("en"); // never called setLocale
    }

    @Test
    void registrationSeedsUsersLocaleFromAcceptLanguage() throws Exception {
        String email = "al-" + System.nanoTime() + "@t.io";
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                        .header("Accept-Language", "it-IT,it;q=0.9,en;q=0.8")
                        .content("""
                                {"email":"%s","password":"correct-horse-battery","name":"Accept Lang"}
                                """.formatted(email)))
                .andExpect(status().isCreated());

        assertThat(users.findByEmail(email).orElseThrow().getLocale()).isEqualTo("it");
    }

    @Test
    void registrationWithNoAcceptLanguageDefaultsToEnglish() throws Exception {
        String email = "noal-" + System.nanoTime() + "@t.io";
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery","name":"No Accept Lang"}
                        """.formatted(email)))
                .andExpect(status().isCreated());

        assertThat(users.findByEmail(email).orElseThrow().getLocale()).isEqualTo("en");
    }

    /** Mints a real invite the way InviteAdminController does, box-scoped via an admin token —
     *  same helper shape as InviteRegistrationTest#createInviteLink. */
    private String createInviteLink(String email, String boxLocale) throws Exception {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Locale Invite Box " + n);
        box.setSlug("libox-" + n);
        box.setTimezone("Europe/Rome");
        box.setLocale(boxLocale);
        boxes.save(box);
        User admin = authService.register("liadm-" + n + "@t.io", "correct-horse-battery", "Adm");
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
        String link = om.readTree(body).get("link").asText();
        return link.substring(link.lastIndexOf('/') + 1);
    }

    @Test
    void invitedMemberInheritsBoxLocaleOverridingAcceptLanguage() throws Exception {
        String email = "invloc-" + System.nanoTime() + "@t.io";
        String token = createInviteLink(email, "it");

        // Browser's own Accept-Language says English — the invite's box locale must win anyway.
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                        .header("Accept-Language", "en-US,en;q=0.9")
                        .content("""
                                {"email":"%s","password":"correct-horse-battery","name":"Invited","inviteToken":"%s"}
                                """.formatted(email, token)))
                .andExpect(status().isCreated());

        assertThat(users.findByEmail(email).orElseThrow().getLocale()).isEqualTo("it");
    }

    @Test
    void invalidInviteTokenFallsBackToAcceptLanguageNotTheBoxLocale() throws Exception {
        String targetEmail = "target-" + System.nanoTime() + "@t.io";
        createInviteLink(targetEmail, "it"); // mint a real "it" box invite...
        String impostorEmail = "impostor-" + System.nanoTime() + "@t.io"; // ...but register a different address

        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON)
                        .header("Accept-Language", "fr-FR,fr;q=0.9")
                        .content("""
                                {"email":"%s","password":"correct-horse-battery","name":"Impostor","inviteToken":"not-a-real-token"}
                                """.formatted(impostorEmail)))
                .andExpect(status().isCreated());

        assertThat(users.findByEmail(impostorEmail).orElseThrow().getLocale()).isEqualTo("fr");
    }
}
