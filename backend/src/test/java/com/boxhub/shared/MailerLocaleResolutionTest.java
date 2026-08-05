package com.boxhub.shared;

import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.thymeleaf.TemplateEngine;

import java.util.Locale;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Proves {@code Mailer.resolveLocale} actually reads {@code users.locale} rather than assuming
 * English — a plain unit test against mocked collaborators, no Spring context or DB needed,
 * since resolveLocale's only dependency is {@link UserRepository}.
 */
class MailerLocaleResolutionTest {

    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final TemplateEngine templates = mock(TemplateEngine.class);
    private final AppUrls appUrls = mock(AppUrls.class);
    private final UserRepository users = mock(UserRepository.class);
    private final Mailer mailer = new Mailer(sender, templates, "BoxHub <no-reply@boxhub.local>", appUrls, users);

    @Test
    void resolvesTheMatchingUsersStoredLocale() {
        User u = new User();
        u.setLocale("fr"); // not a shipped locale — proves passthrough, not a guess at a real one
        when(users.findByEmail("athlete@t.io")).thenReturn(Optional.of(u));

        assertThat(mailer.resolveLocale("athlete@t.io")).isEqualTo(Locale.forLanguageTag("fr"));
    }

    @Test
    void aDifferentUsersLocaleProducesADifferentResult() {
        User u = new User();
        u.setLocale("de");
        when(users.findByEmail("coach@t.io")).thenReturn(Optional.of(u));

        // The discriminating half of the proof: this is not always "en" regardless of input.
        assertThat(mailer.resolveLocale("coach@t.io")).isNotEqualTo(Locale.ENGLISH);
        assertThat(mailer.resolveLocale("coach@t.io")).isEqualTo(Locale.forLanguageTag("de"));
    }

    @Test
    void fallsBackToEnglishWhenTheAddressIsNotARegisteredUser() {
        // The invite path: the recipient hasn't accepted yet, so there is no User row at all.
        when(users.findByEmail("invitee@t.io")).thenReturn(Optional.empty());

        assertThat(mailer.resolveLocale("invitee@t.io")).isEqualTo(Locale.ENGLISH);
    }

    @Test
    void lookupIsCaseInsensitiveAndTrimmed() {
        User u = new User();
        u.setLocale("es");
        when(users.findByEmail("mixed@t.io")).thenReturn(Optional.of(u));

        assertThat(mailer.resolveLocale("  Mixed@T.io  ")).isEqualTo(Locale.forLanguageTag("es"));
    }

    @Test
    void blankAddressFallsBackRatherThanQuerying() {
        assertThat(mailer.resolveLocale(null)).isEqualTo(Locale.ENGLISH);
        assertThat(mailer.resolveLocale("  ")).isEqualTo(Locale.ENGLISH);
    }
}
