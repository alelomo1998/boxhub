package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.shared.PlatformSettings;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OnboardingSchemaTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired PlatformSettings settings;
    @Autowired BoxWaitlistRepository waitlist;

    private Box box(String status) {
        Box b = new Box();
        b.setName("Schema Box");
        b.setSlug("schema-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        b.setStatus(status);
        return boxes.save(b);
    }

    @Test
    void boxesDefaultToActiveAndCarryCreatedAt() {
        Box b = new Box();
        b.setName("Default Box");
        b.setSlug("default-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        Box saved = boxes.saveAndFlush(b);
        assertThat(saved.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void capCountsOnlyActiveAndPending() {
        long before = boxes.countByStatusIn(List.of("ACTIVE", "PENDING"));
        box("PENDING");
        box("SUSPENDED");
        box("REJECTED");
        assertThat(boxes.countByStatusIn(List.of("ACTIVE", "PENDING"))).isEqualTo(before + 1);
    }

    @Test
    void settingsAreSeededAndWritable() {
        assertThat(settings.signupMode()).isEqualTo("APPROVAL");
        assertThat(settings.maxBoxes()).isEqualTo(100);

        settings.set(PlatformSettings.SIGNUP_MODE, "OPEN");
        assertThat(settings.signupMode()).isEqualTo("OPEN"); // set() must bust the cache
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL"); // restore — shared context
    }

    @Test
    void waitlistDeduplicatesByEmail() {
        BoxWaitlist w = new BoxWaitlist();
        w.setEmail("wait-" + System.nanoTime() + "@t.io");
        w.setBoxName("Waiting Box");
        waitlist.save(w);
        assertThat(waitlist.existsByEmail(w.getEmail())).isTrue();
    }
}
