package com.boxhub.shared;

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
import java.util.Map;

/**
 * Renders a Thymeleaf template and sends it.
 *
 * A failed send is logged, never rethrown: every mail BoxHub sends is user-recoverable
 * (resend verification, forgot password), so an SMTP hiccup must not fail the request that
 * triggered it. That is also why there is no outbox table.
 */
@Component
public class Mailer {

    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    private final JavaMailSender sender;
    private final TemplateEngine templates;
    private final String from;
    private final AppUrls appUrls;

    public Mailer(JavaMailSender sender, TemplateEngine templates,
                  @Value("${boxhub.mail.from}") String from,
                  AppUrls appUrls) {
        this.sender = sender;
        this.templates = templates;
        this.from = from;
        this.appUrls = appUrls;
    }

    @Async
    public void send(String to, String subject, String template, Map<String, Object> vars) {
        try {
            Context ctx = new Context();
            vars.forEach(ctx::setVariable);
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
     * place BoxHub logs anything about a person at all.
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
}
