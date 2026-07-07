import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('roleGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
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
});
