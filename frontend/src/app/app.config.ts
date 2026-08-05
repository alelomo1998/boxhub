import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withXsrfConfiguration, withXhr } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { ThemeService } from './core/theme/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withXhr(), 
      withInterceptors([authInterceptor]),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    // Theme first, and synchronously: ThemeService writes data-theme in its constructor, but it
    // was only ever constructed via AppComponent — which Angular does not create until every
    // initializer has settled, i.e. after the auth bootstrap's csrf + /api/me round-trip. That
    // left the document unthemed (no data-theme, cold default colours) for as long as the
    // network took. This initializer is sync, so it runs to completion before the async one below.
    provideAppInitializer(() => { inject(ThemeService); }),
    provideAppInitializer(() => inject(AuthService).bootstrap()),
  ],
};
