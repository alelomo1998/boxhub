import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { signal } from '@angular/core';
import { entryGuard } from './entry.guard';
import { AuthService } from './auth.service';

function run(session: boolean, box: { boxId: string; boxName: string; role: 'ATHLETE' | 'COACH' | 'BOX_ADMIN' } | null) {
  // Reset first: the role case below calls run() three times in one spec, and TestBed refuses a
  // second configureTestingModule() once the module has been instantiated — which the previous
  // run's runInInjectionContext already did.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { hasSession: () => session, activeBox: signal(box) } },
    ],
  });
  return TestBed.runInInjectionContext(() => entryGuard(null as any, null as any)) as UrlTree;
}

describe('entryGuard', () => {
  it('sends an anonymous visitor to the login form', () => {
    expect(run(false, null).toString()).toBe('/auth/login');
  });

  // The defect this guard exists to kill: / redirected to auth/login unconditionally, so a
  // person who was already logged in was shown a login form.
  it('never shows a login form to someone who is already logged in', () => {
    expect(run(true, null).toString()).not.toContain('/auth/login');
  });

  it('resumes the gym you were last in, by the role you hold there', () => {
    expect(run(true, { boxId: 'b1', boxName: 'x', role: 'BOX_ADMIN' }).toString()).toBe('/admin');
    expect(run(true, { boxId: 'b1', boxName: 'x', role: 'COACH' }).toString()).toBe('/coach');
    expect(run(true, { boxId: 'b1', boxName: 'x', role: 'ATHLETE' }).toString()).toBe('/athlete');
  });

  it('falls back to the hub when no gym is active — including for a boxless account', () => {
    expect(run(true, null).toString()).toBe('/gyms');
  });
});
