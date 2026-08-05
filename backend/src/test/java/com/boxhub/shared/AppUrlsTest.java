package com.boxhub.shared;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The app lives under /app; the API and the OAuth callback live at the server root. Getting this
 * backwards breaks Google SSO in production only — nginx proxies /login/oauth2/ at the root and
 * Google matches redirect_uri against a console registration. M12c fixed exactly that bug; this
 * class exists so the /app migration cannot re-introduce it.
 */
class AppUrlsTest {

    @Test
    void appLinkCarriesTheAppBase() {
        AppUrls urls = new AppUrls("https://boxhub.example", "/app");
        assertThat(urls.appLink("/auth/verify?token=abc"))
                .isEqualTo("https://boxhub.example/app/auth/verify?token=abc");
    }

    @Test
    void originNeverCarriesTheAppBase() {
        AppUrls urls = new AppUrls("https://boxhub.example", "/app");
        assertThat(urls.origin()).isEqualTo("https://boxhub.example");
    }

    @Test
    void aTrailingSlashOnTheConfiguredUrlDoesNotDoubleUp() {
        AppUrls urls = new AppUrls("https://boxhub.example/", "/app");
        assertThat(urls.appLink("/membership")).isEqualTo("https://boxhub.example/app/membership");
        assertThat(urls.origin()).isEqualTo("https://boxhub.example");
    }

    @Test
    void anEmptyAppBaseIsSupportedSoTheMigrationCanBeReversed() {
        AppUrls urls = new AppUrls("https://boxhub.example", "");
        assertThat(urls.appLink("/membership")).isEqualTo("https://boxhub.example/membership");
    }
}
