package com.boxhub.identity;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class DeviceLabelTest {
    @Test void namesCommonBrowserAndPlatformPairs() {
        assertThat(DeviceLabel.of("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"))
                .isEqualTo("Chrome on macOS");
        assertThat(DeviceLabel.of("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"))
                .isEqualTo("Safari on iPhone");
        assertThat(DeviceLabel.of("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0"))
                .isEqualTo("Edge on Windows");
    }

    @Test void neverThrowsAndNeverReturnsEmpty() {
        // A User-Agent is attacker-controlled: null, blank and junk must all produce a label.
        assertThat(DeviceLabel.of(null)).isNotBlank();
        assertThat(DeviceLabel.of("")).isNotBlank();
        assertThat(DeviceLabel.of("!!! not a user agent !!!")).isNotBlank();
    }

    @Test void doesNotEchoAnUnboundedAttackerControlledStringBackToTheUser() {
        // The whole point is a SHORT label. Echoing the raw UA on no match would reintroduce the
        // 150-character row this task exists to remove, and hand an attacker a text injection
        // surface into another session's row.
        String hostile = "x".repeat(4000);
        assertThat(DeviceLabel.of(hostile).length()).isLessThan(40);
    }
}
