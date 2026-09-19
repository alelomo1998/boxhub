import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter, withViewTransitions, TitleStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors, withXsrfConfiguration, withXhr } from '@angular/common/http';
import { routes } from './app.routes';
import { PageTitleStrategy } from './core/page-title.strategy';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { deepestRoute } from './core/shell-chrome.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // Every `date`/`number`/`currency` pipe in the app resolves its formatting locale through
    // this token. 'en-US' matches what main.ts's initLocale() resolves today (English is the
    // only locale that ships) — this is the seam a future resolved user/box locale plugs into.
    { provide: LOCALE_ID, useValue: 'en-US' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withViewTransitions() is a GLOBAL router option — left unguarded it would animate every
    // route change in the app, far outside M17a's one screen. onViewTransitionCreated fires for
    // EVERY navigation, so it skips the browser's native transition unless the navigation enters
    // or leaves a detail route (route `data.detail`, the same flag ShellChromeService reads) —
    // that skip is what keeps the blast radius at class detail's open/close morph (spec §5.3).
    // `from`/`to` are the router state's ROOT snapshot, so `deepestRoute` walks to the leaf the
    // way ShellChromeService already does, rather than re-implementing that walk here.
    provideRouter(routes, withViewTransitions({
      onViewTransitionCreated: ({ transition, from, to }) => {
        const entering = !!deepestRoute(to).data['detail'];
        const leaving = !!deepestRoute(from).data['detail'];
        if (!entering && !leaving) transition.skipTransition();
      },
    })),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideHttpClient(withXhr(), 
      withInterceptors([authInterceptor]),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    provideAppInitializer(() => inject(AuthService).bootstrap()),
  ],
};
