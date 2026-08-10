import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  function setup(errorParam: string | null = null, returnUrl: string | null = null) {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) =>
          k === 'error' ? errorParam : k === 'returnUrl' ? returnUrl : null } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(LoginPage);
  }

  afterEach(() => http.verify());

  it('403 EMAIL_NOT_VERIFIED shows a message and the resend control', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/login').flush({ detail: 'EMAIL_NOT_VERIFIED' }, { status: 403, statusText: 'Forbidden' });

    expect(cmp.unverified()).toBeTrue();
    expect(cmp.error()).toBe('Verify your email to sign in');
  });

  it('a plain 401 shows the generic no-enumeration message', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('wrong');
    cmp.submit();
    http.expectOne('/api/auth/login').flush({ detail: 'BAD_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });

    expect(cmp.error()).toBe('Invalid email or password');
    expect(cmp.unverified()).toBeFalse();
  });

  it('a 429 on login shows a rate-limit message distinct from bad credentials', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/login').flush({ detail: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.error()).toBe('Too many attempts — try again later.');
  });

  it('renders a human message for the google_email_unverified oauth redirect', () => {
    const fixture = setup('google_email_unverified');
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: true });

    expect(fixture.componentInstance.error()).toContain('Google');
    expect(fixture.componentInstance.showGoogle()).toBeTrue();
  });

  it('renders a human message for a bare google oauth failure', () => {
    const fixture = setup('google');
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: true });

    expect(fixture.componentInstance.error()).toBe('Google sign-in failed — try again.');
  });

  it('keeps the Google control hidden when the providers lookup itself fails', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.showGoogle()).toBeFalse();
  });

  it('a single-membership login into a SUSPENDED box surfaces a message instead of stalling', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('correct-horse-battery');
    cmp.submit();
    // login() re-bootstraps (csrf then /api/me, sequential awaits); the page reads memberships
    // from that session, so drain the microtasks between each flushed request.
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush(
      { id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
        memberships: [{ boxId: 'b1', boxName: 'Gone Gym', boxSlug: 'gone', role: 'BOX_ADMIN', boxStatus: 'SUSPENDED' }] });
    flushMicrotasks();
    // box-token mint 403s a suspended box — the error arm must fire, not leave a blank form.
    http.expectOne('/api/auth/box-token').flush({ detail: 'BOX_SUSPENDED' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();

    expect(cmp.error()).toContain('unavailable');
  }));

  it('honours returnUrl ahead of the role redirect, even with a membership present', fakeAsync(() => {
    const fixture = setup(null, '/wod/today');
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigateByUrl');

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('correct-horse-battery');
    cmp.submit();
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush(
      { id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
        memberships: [{ boxId: 'b1', boxName: 'Live Gym', boxSlug: 'live', role: 'ATHLETE', boxStatus: 'ACTIVE' }] });
    flushMicrotasks();

    // returnUrl wins before box-token is ever minted — no /api/auth/box-token request follows.
    expect(navSpy).toHaveBeenCalledWith('/wod/today');
  }));

  it('routes to the box picker when the user has more than one membership', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigateByUrl');

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('correct-horse-battery');
    cmp.submit();
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush(
      { id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
        memberships: [
          { boxId: 'b1', boxName: 'Gym One', boxSlug: 'one', role: 'ATHLETE', boxStatus: 'ACTIVE' },
          { boxId: 'b2', boxName: 'Gym Two', boxSlug: 'two', role: 'COACH', boxStatus: 'ACTIVE' },
        ] });
    flushMicrotasks();

    expect(navSpy).toHaveBeenCalledWith('/auth/boxes');
  }));

  it('a resend that 429s shows an error instead of failing silently', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io');
    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush({ detail: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.resendPending()).toBeFalse();
    expect(cmp.resendError()).toBe('Could not resend — try again.');
  });

  it('a successful resend navigates to check-email with the address attached', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io');
    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush(null, { status: 204, statusText: 'No Content' });

    expect(cmp.resendPending()).toBeFalse();
    expect(navSpy).toHaveBeenCalledWith(['/auth/check-email'], { queryParams: { email: 'a@b.io' } });
  });
});
