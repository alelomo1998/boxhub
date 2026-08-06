package com.boxhub.shared;

import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

/**
 * Renders a Thymeleaf template and sends it.
 *
 * A failed send is logged, never rethrown: every mail rxed sends is user-recoverable
 * (resend verification, forgot password), so an SMTP hiccup must not fail the request that
 * triggered it. That is also why there is no outbox table.
 * <p>
 * <b>Locale (M13a T10).</b> {@code send} looks the recipient's locale up itself, from
 * {@code users.locale}, by email address — it does NOT take a locale parameter. That was a
 * choice between two options: caller-passes-locale, or Mailer-looks-up-by-address. Looks-up won,
 * because {@code send}'s six call sites are not uniform in what they hold: some (verify, reset,
 * the payment/lapse mails) resolve through a real {@link User}, but the invite path only ever
 * has an {@code Invite} row (the recipient has not registered yet) and the box-approved/rejected
 * path only has a bare email string off a {@code TransitionResult} record — neither carries a
 * {@code User} to read a locale off. A single lookup inside {@code send} handles all six
 * uniformly, with no signature change and no risk of a caller passing a stale locale. A
 * registered recipient gets their stored locale; an unregistered one (invite) or a lookup miss
 * falls back to English — the only locale that ships, so this is not user-visible today.
 */
@Component
public class Mailer {

    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    private final JavaMailSender sender;
    private final TemplateEngine templates;
    private final String from;
    private final AppUrls appUrls;
    private final UserRepository users;

    public Mailer(JavaMailSender sender, TemplateEngine templates,
                  @Value("${boxhub.mail.from}") String from,
                  AppUrls appUrls, UserRepository users) {
        this.sender = sender;
        this.templates = templates;
        this.from = from;
        this.appUrls = appUrls;
        this.users = users;
    }

    @Async
    public void send(String to, String subject, String template, Map<String, Object> vars) {
        try {
            Context ctx = new Context(resolveLocale(to));
            vars.forEach(ctx::setVariable);
            ctx.setVariable("brand", Brand.NAME);
            String html = templates.process("mail/" + template, ctx);

            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, false, StandardCharsets.UTF_8.name());
            helper.setTo(to);
            helper.setFrom(from);
            helper.setSubject(subject);
            helper.setText(html, true);
            sender.send(msg);
            log.info("mail sent: template={} to={}", template, mask(to));
        } catch (Exception e) {
            log.error("mail FAILED: template={} to={} — {}", template, mask(to), e.getMessage());
        }
    }

    /**
     * Enough of an address to correlate a delivery failure with a member, without writing the
     * identifier itself into a log file that has no retention policy. Mail delivery is the one
     * place rxed logs anything about a person at all.
     */
    static String mask(String email) {
        if (email == null || email.isBlank()) return "(none)";
        int at = email.indexOf('@');
        if (at <= 0) return "***";
        return email.charAt(0) + "***" + email.substring(at);
    }

    /** Absolute link into the SPA, e.g. link("/verify?token=abc"). */
    public String link(String path) {
        return appUrls.appLink(path);
    }

    /**
     * A registered user's stored locale, or English if the address is not a registered user
     * (an invitee before they accept) or does not resolve to one at all. Never throws — a
     * lookup miss is routine, not an error, and must not turn into a swallowed send failure.
     */
    Locale resolveLocale(String email) {
        if (email == null || email.isBlank()) return Locale.ENGLISH;
        return users.findByEmail(email.toLowerCase().trim())
                .map(User::getLocale)
                .map(Locale::forLanguageTag)
                .orElse(Locale.ENGLISH);
    }
}
