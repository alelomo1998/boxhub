package com.boxhub.shared;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.StaticMessageSource;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;
import org.thymeleaf.templatemode.TemplateMode;
import org.thymeleaf.templateresolver.ClassLoaderTemplateResolver;

import java.io.InputStream;
import java.util.Locale;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the mail templates render their text FROM the {@code messages.properties} bundle
 * rather than from an inline literal that merely got moved around — the thing this task is
 * actually supposed to prove, per the M13a-T10 verification bar.
 * <p>
 * This builds its own {@link SpringTemplateEngine} against the real classpath templates and a
 * {@link StaticMessageSource} seeded from the real {@code messages.properties} (not against the
 * app's Spring context) — {@code SpringTemplateEngine.setTemplateEngineMessageSource} is exactly
 * the escape hatch Thymeleaf-Spring provides for this, so no {@code @SpringBootTest} / DB /
 * Testcontainers boot is needed for what is a pure rendering question.
 */
class MailTemplatesI18nTest {

    @Test
    void verifyTemplateRendersBundleTextNotAHardcodedString() throws Exception {
        StaticMessageSource messages = realBundle();
        SpringTemplateEngine engine = engineWith(messages);

        String html = render(engine, "mail/verify");

        // The bundle's actual current value, resolved the same way the template resolves it —
        // if the template still had this text baked in as a literal, this would prove nothing,
        // so the negative control below is what actually discriminates.
        assertThat(html).contains(
                messages.getMessage("verify.body", new Object[]{Brand.NAME}, Locale.ENGLISH));
        assertThat(html).contains("Verify my email");

        // The template markup itself no longer has the sentence as a live expression — only as
        // Thymeleaf's "natural templating" default text inside th:text (a static preview value,
        // same convention the pre-i18n templates already used, e.g. th:text="'Hi ' + ${name}"
        // defaulting to "Hi,"). That default is inert at render time; #{verify.body(...)} always
        // overrides it, which is exactly what the render-time assertion above and the negative
        // control below prove. See templates/mail/verify.html: the sentence now lives only in
        // messages.properties as the SOURCE the render pulls from, not as computed Java string
        // concatenation the way it was before this task (compare git history: it used to be
        // `<p>Confirm your email address ...</p>` with no th:text at all).
    }

    @Test
    void negativeControl_changingTheBundleValueChangesTheRenderedMail() throws Exception {
        StaticMessageSource messages = realBundle();
        SpringTemplateEngine engine = engineWith(messages);

        String before = render(engine, "mail/verify");
        assertThat(before).contains("Confirm your email address to finish setting up your BoxHub account.");

        // Mutate ONLY the bundle. Nothing about the template, the engine, or Mailer changes.
        messages.addMessage("verify.body", Locale.ENGLISH, "NEGATIVE CONTROL — bundle value changed");

        String after = render(engine, "mail/verify");

        assertThat(after).contains("NEGATIVE CONTROL — bundle value changed");
        assertThat(after).doesNotContain("Confirm your email address to finish setting up your BoxHub account.");
        assertThat(after).isNotEqualTo(before);
    }

    @Test
    void brandNameIsInterpolatedFromOneConstantAcrossTemplates() throws Exception {
        StaticMessageSource messages = realBundle();
        SpringTemplateEngine engine = engineWith(messages);

        // layout.html's wordmark and a content template's brand-bearing sentence both come from
        // the same Brand.NAME — proven by rendering "invite" (its content pulls the layout in).
        String html = render(engine, "mail/invite");

        assertThat(html).contains(Brand.NAME.toUpperCase(Locale.ROOT)); // layout wordmark
        assertThat(html).contains("invited you to join them on " + Brand.NAME + "."); // invite.title
    }

    // --- fixture plumbing --------------------------------------------------------------------

    private StaticMessageSource realBundle() throws Exception {
        StaticMessageSource messages = new StaticMessageSource();
        Properties props = new Properties();
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("messages.properties")) {
            assertThat(in).as("messages.properties must be on the classpath").isNotNull();
            props.load(in);
        }
        for (String key : props.stringPropertyNames()) {
            messages.addMessage(key, Locale.ENGLISH, props.getProperty(key));
        }
        return messages;
    }

    private SpringTemplateEngine engineWith(StaticMessageSource messages) {
        ClassLoaderTemplateResolver resolver = new ClassLoaderTemplateResolver();
        resolver.setPrefix("templates/");
        resolver.setSuffix(".html");
        resolver.setTemplateMode(TemplateMode.HTML);
        resolver.setCharacterEncoding("UTF-8");

        SpringTemplateEngine engine = new SpringTemplateEngine();
        engine.setTemplateResolver(resolver);
        engine.setTemplateEngineMessageSource(messages);
        return engine;
    }

    private String render(SpringTemplateEngine engine, String template) {
        Context ctx = new Context(Locale.ENGLISH);
        ctx.setVariable("name", "Alessandro");
        ctx.setVariable("boxName", "CrossFit Testville");
        ctx.setVariable("link", "https://boxhub.test/verify?token=abc");
        ctx.setVariable("brand", Brand.NAME);
        return engine.process(template, ctx);
    }
}
