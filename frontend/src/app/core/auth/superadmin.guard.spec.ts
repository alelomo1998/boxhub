import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideRouter, UrlTree } from '@angular/router';
import { superadminGuard } from './superadmin.guard';
import { AuthService } from './auth.service';

describe('superadminGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideRouter([])] });
  });

  it('redirects to login when anonymous', () => {
    const result = TestBed.runInInjectionContext(() => superadminGuard({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
  });

  it('redirects a normal user to /', () => {
    TestBed.inject(AuthService).session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [],
    });
    const result = TestBed.runInInjectionContext(() => superadminGuard({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/');
  });

  it('allows a superadmin', () => {
    TestBed.inject(AuthService).session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: true, memberships: [],
    });
    const result = TestBed.runInInjectionContext(() => superadminGuard({} as any, {} as any));
    expect(result).toBe(true);
  });
});
