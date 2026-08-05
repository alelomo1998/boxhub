import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  function setup(errorParam: string | null = null) {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'error' ? errorParam : null) } } } },
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
    cmp.email = 'a@b.io'; cmp.password = 'whatever12';
    cmp.submit();
    http.expectOne('/api/auth/login').flush({ detail: 'EMAIL_NOT_VERIFIED' }, { status: 403, statusText: 'Forbidden' });

    expect(cmp.unverified()).toBeTrue();
    expect(cmp.error()).toBe('Verify your email to sign in');
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

  it('a single-membership login into a SUSPENDED box surfaces a message instead of stalling', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.io'; cmp.password = 'correct-horse-battery';
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

  it('a resend that 429s shows an error instead of failing silently', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.io';
    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush({ detail: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.resendPending()).toBeFalse();
    expect(cmp.resendError()).toBe('Could not resend — try again.');
  });
});
