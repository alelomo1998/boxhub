import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { sessionGuard } from './session.guard';

describe('sessionGuard', () => {
  function run(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => sessionGuard(null as never, null as never)) as boolean | UrlTree;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('allows a signed-in user who has NO membership at all', () => {
    TestBed.inject(AuthService).session.set(
      { id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [], superadmin: false });
    expect(run()).toBeTrue();
  });

  it('allows a signed-in user whose only box is SUSPENDED', () => {
    TestBed.inject(AuthService).session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: 'b1', boxName: 'B', boxSlug: 'b', role: 'ATHLETE', boxStatus: 'SUSPENDED' }],
    });
    expect(run()).toBeTrue();
  });

  it('sends a signed-out visitor to login', () => {
    const result = run();
    expect(result instanceof UrlTree).toBeTrue();
    expect((result as UrlTree).toString()).toBe('/auth/login');
  });
});
