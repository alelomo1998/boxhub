package com.boxhub.identity;

/**
 * Best-effort, human-readable label for a raw User-Agent string ("Chrome on macOS" instead of
 * the 80-150 char original). A User-Agent is attacker-controlled input: this is a short ordered
 * list of substring checks with an honest fallback, never identification. Never throws, never
 * returns empty, and never interpolates the raw (unbounded) input into the result — echoing it
 * back on no match would both reintroduce the long row this exists to remove and hand an
 * attacker a text-injection surface into another user's session row.
 *
 * Order matters: Edge's UA contains "Chrome", and Chrome's contains "Safari", so more specific
 * browsers are checked first.
 */
public final class DeviceLabel {
    private DeviceLabel() {}

    private static final String FALLBACK = "Unknown device";

    public static String of(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return FALLBACK;

        String browser = browser(userAgent);
        String platform = platform(userAgent);
        if (browser == null || platform == null) return FALLBACK;
        return browser + " on " + platform;
    }

    private static String browser(String ua) {
        if (ua.contains("Edg/")) return "Edge";
        if (ua.contains("Chrome")) return "Chrome";
        if (ua.contains("Firefox")) return "Firefox";
        if (ua.contains("Safari")) return "Safari";
        return null;
    }

    private static String platform(String ua) {
        // Android's UA contains "Linux", so check it first.
        if (ua.contains("iPhone")) return "iPhone";
        if (ua.contains("iPad")) return "iPad";
        if (ua.contains("Android")) return "Android";
        if (ua.contains("Mac OS X") || ua.contains("Macintosh")) return "macOS";
        if (ua.contains("Windows")) return "Windows";
        if (ua.contains("Linux")) return "Linux";
        return null;
    }
}
