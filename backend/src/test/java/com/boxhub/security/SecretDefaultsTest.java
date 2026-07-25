package com.boxhub.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * <b>The M10 lesson, codified.</b> M10 shipped a real, working AES-256 key as the default of
 * {@code boxhub.stripe.enc-key} in {@code application.yml}. Any deploy that forgot
 * {@code BOXHUB_STRIPE_ENC_KEY} would have booted happily and encrypted every box's live Stripe
 * credentials with a key sitting in git history — and nothing would have looked wrong. It was caught
 * in review; this test is what stops the next one.
 * <p>
 * The rule: <b>no secret gets a usable default; a missing secret fails startup.</b> A bare
 * {@code ${VAR}} is the correct shape — Spring fails placeholder resolution at boot, which is the
 * fail-closed behaviour we want. {@code ${VAR:something}} is a bug.
 * <p>
 * An <i>empty</i> fallback ({@code ${VAR:}}) is fine and needs no exception entry: an empty string is
 * not a working credential, it is "unset" spelled differently, and several optional-feature switches
 * legitimately rely on it (SMTP auth off, no superadmin emails configured).
 */
class SecretDefaultsTest {

    /** Property-name shapes that mean "this value is credential material". */
    private static final Pattern SECRET_ISH =
            Pattern.compile("secret|password|key|token|credential", Pattern.CASE_INSENSITIVE);

    /** {@code ${VAR}} or {@code ${VAR:fallback}} — group 2 is the fallback, null when absent. */
    private static final Pattern PLACEHOLDER = Pattern.compile("^\\$\\{([^:}]+)(?::(.*))?}$");

    /**
     * Properties whose NAME matches {@link #SECRET_ISH} but which are not BoxHub secrets. Keep this
     * list minimal and justified — it is the thing the next reviewer reads.
     *
     * <ul>
     *   <li><b>{@code spring.datasource.password}</b> — not an application secret but a
     *   deployment-supplied database credential, and the default ({@code boxhub}) only ever matches
     *   the throwaway local/compose Postgres. Crucially, its failure mode is the opposite of a
     *   crypto key's: a wrong DB password fails loudly and instantly at connection time, so it
     *   cannot silently do damage the way a committed AES key can (which succeeds, and quietly
     *   protects nothing). Removing the default would also break plain {@code mvn spring-boot:run}
     *   against a local dev Postgres for no security gain. Prod supplies
     *   {@code SPRING_DATASOURCE_PASSWORD}.</li>
     * </ul>
     */
    private static final Set<String> ALLOWED_WITH_DEFAULT = Set.of(
            "spring.datasource.password"
    );

    /** Positive control — if the parser or the regex silently stops matching, this fails first. */
    private static final List<String> MUST_BE_SCANNED = List.of(
            "boxhub.jwt.secret",
            "boxhub.stripe.enc-keys",
            "boxhub.media.link-secret"
    );

    @Test
    void noSecretPropertyHasAUsableDefault() {
        Map<String, String> secretish = secretishProperties();

        // Vacuous-pass guard: prove the scan actually saw the config, and specifically the three
        // properties whose fail-closed shape this test exists to protect.
        assertThat(secretish).as("secret-shaped properties found in application.yml").isNotEmpty();
        assertThat(secretish.keySet()).as("scanned properties").containsAll(MUST_BE_SCANNED);

        List<String> violations = new ArrayList<>();
        for (Map.Entry<String, String> e : secretish.entrySet()) {
            if (ALLOWED_WITH_DEFAULT.contains(e.getKey())) continue;

            String value = e.getValue();
            Matcher m = PLACEHOLDER.matcher(value);
            if (!m.matches()) {
                violations.add(e.getKey() + " = a literal value (a secret must come from the "
                        + "environment as ${VAR}, never be committed here)");
                continue;
            }
            String fallback = m.group(2);
            if (fallback != null && !fallback.isEmpty()) {
                violations.add(e.getKey() + " = ${" + m.group(1) + ":<fallback>} — a missing secret "
                        + "must fail startup, not fall back to a committed value");
            }
        }

        assertThat(violations)
                .as("secret-shaped properties in application.yml carrying a usable default. Either "
                        + "drop the fallback (${VAR}) or, if this is genuinely not a secret, add it to "
                        + "SecretDefaultsTest.ALLOWED_WITH_DEFAULT with a written justification")
                .isEmpty();
    }

    /** Flattened {@code application.yml} restricted to properties whose name looks like a secret. */
    private static Map<String, String> secretishProperties() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        Properties flat = yaml.getObject();
        assertThat(flat).as("application.yml on the classpath").isNotNull();

        Map<String, String> out = new TreeMap<>();
        for (String name : flat.stringPropertyNames()) {
            if (SECRET_ISH.matcher(name).find()) {
                out.put(name, flat.getProperty(name));
            }
        }
        return out;
    }
}
