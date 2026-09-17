import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';
import { sessionGuard } from './core/auth/session.guard';

describe('account routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it('keeps the emailed confirmation path reachable WITHOUT a session', () => {
    const router = TestBed.inject(Router);
    const tree = router.parseUrl('/account/email?token=abc');
    const match = routes.find(r => r.path === 'account/email');
    // The emailed link is clicked from an inbox, possibly on a device that never logged in.
    expect(match).withContext('the emailed path must still have its own route').toBeDefined();
    expect(match!.canActivate).withContext('and it must carry NO guard').toBeUndefined();
    expect(tree.queryParams['token']).toBe('abc');
  });

  it('guards the account area itself', () => {
    const area = routes.find(r => r.path === 'account');
    expect(area).toBeDefined();
    expect(area!.canActivate).toEqual([sessionGuard]);
  });

  it('redirects the old security URL into the area', () => {
    const old = routes.find(r => r.path === 'account/security');
    expect(old?.redirectTo).toBe('/account');
  });
});

describe('coach routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it('redirects the old benchmarks path into the WOD library — benchmarks merged into it (M14c-b)', () => {
    const coach = routes.find(r => r.path === 'coach');
    const benchmarks = coach!.children!.find(r => r.path === 'benchmarks');
    expect(benchmarks?.redirectTo).toBe('wods');
  });

  it('redirects the old types path into classes — Types moved admin-only (M14c-b)', () => {
    const coach = routes.find(r => r.path === 'coach');
    const types = coach!.children!.find(r => r.path === 'types');
    expect(types?.redirectTo).toBe('classes');
  });
});

describe('admin routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it('loads the class types page under admin (M14c-b)', async () => {
    const admin = routes.find(r => r.path === 'admin');
    const types = admin!.children!.find(r => r.path === 'types');
    expect(types).toBeDefined();
    const { TypesPage } = await import('./features/programming/types.page');
    const loaded = await types!.loadComponent!();
    expect(loaded).toBe(TypesPage);
  });
});
