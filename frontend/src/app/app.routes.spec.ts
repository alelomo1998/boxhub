import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';

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
    expect(area!.canActivate?.length).toBe(1);
  });

  it('redirects the old security URL into the area', () => {
    const old = routes.find(r => r.path === 'account/security');
    expect(old?.redirectTo).toBe('/account');
  });
});
