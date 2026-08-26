import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideRouter, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('roleGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideRouter([])] });
  });

  it('redirects to login when no active box', () => {
    const result = TestBed.runInInjectionContext(() => roleGuard(['ATHLETE'])({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
  });

  it('redirects athlete away from admin to their area', () => {
    TestBed.inject(AuthService).activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });
    const result = TestBed.runInInjectionContext(() => roleGuard(['BOX_ADMIN'])({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/athlete');
  });

  it('allows matching role', () => {
    TestBed.inject(AuthService).activeBox.set({ boxId: '1', boxName: 'Demo', role: 'BOX_ADMIN' });
    const result = TestBed.runInInjectionContext(() => roleGuard(['BOX_ADMIN'])({} as any, {} as any));
    expect(result).toBe(true);
  });

  it('sends a signed-in member with no active gym to the hub, not to a login form', () => {
    TestBed.inject(AuthService).session.set(
      { id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [], superadmin: false });
    const result = TestBed.runInInjectionContext(() => roleGuard(['ATHLETE'])({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/gyms');
  });

  it('still sends an anonymous visitor to the login form', () => {
    const result = TestBed.runInInjectionContext(() => roleGuard(['ATHLETE'])({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
  });
});
