import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { appConfig } from './app.config';
import { AuthService } from './core/auth/auth.service';

// Regression guard for the flash-of-unthemed-content fix. ThemeService applies data-theme in its
// constructor, but that used to happen only once AppComponent was created — after the auth
// bootstrap's csrf + /api/me round-trip. The sync theme initializer in app.config.ts must run to
// completion during app init, independent of the async auth bootstrap, so data-theme is present
// immediately. This spec fails if that initializer is removed from app.config.ts.
describe('appConfig initializers', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    // Real appConfig providers (so a reorder/removal of the theme initializer is caught), but stub
    // AuthService.bootstrap so the async initializer resolves instantly instead of hanging on
    // unflushed HTTP — the theme initializer under test is untouched and still real.
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        { provide: AuthService, useValue: { bootstrap: () => Promise.resolve() } },
      ],
    });
  });

  it('applies the theme during app init, not after the auth bootstrap', async () => {
    // Constructing ApplicationInitStatus runs the initializers; the sync theme one completes here.
    const init = TestBed.inject(ApplicationInitStatus);

    expect(document.documentElement.dataset['theme']).toBe('dark');

    await init.donePromise;
  });
});
