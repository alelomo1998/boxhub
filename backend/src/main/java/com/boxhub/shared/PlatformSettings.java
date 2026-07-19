package com.boxhub.shared;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;

/**
 * Typed, cached access to platform_settings. In-memory, single-node — same deliberate
 * tradeoff as the rate limiter (BACKLOG: Redis when a second node exists). The 30s TTL
 * bounds staleness for reads that skipped set()'s explicit bust.
 */
@Service
public class PlatformSettings {

    public static final String SIGNUP_MODE = "signup_mode";
    public static final String MAX_BOXES = "max_boxes";

    private final PlatformSettingRepository repo;
    private final Cache<String, String> cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(30))
            .build();

    public PlatformSettings(PlatformSettingRepository repo) {
        this.repo = repo;
    }

    public String signupMode() { return get(SIGNUP_MODE); }

    public int maxBoxes() { return Integer.parseInt(get(MAX_BOXES)); }

    @Transactional
    public void set(String key, String value) {
        PlatformSetting s = repo.findById(key).orElseThrow();
        s.setValue(value);
        repo.save(s);
        cache.invalidate(key);
    }

    private String get(String key) {
        return cache.get(key, k -> repo.findById(k).orElseThrow().getValue());
    }
}
