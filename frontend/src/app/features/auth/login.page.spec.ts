import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { LoginPage } from './login.page';

// Verbatim from the seeded prescriptions in backend/src/main/resources/db/migration/V5*.sql —
// independent of login.page.ts's own BENCHMARKS const, so a corrupted entry there (empty,
// mistyped, wrong load) fails this instead of the test just echoing the same bug back.
const KNOWN_BENCHMARKS: Record<string, { scheme: string; movements: string[] }> = {
  Fran: { scheme: '21-15-9 reps for time', movements: ['Thrusters (95/65 lb)', 'Pull-Ups'] },
  Grace: { scheme: '30 for time', movements: ['Clean and Jerks (135/95 lb)'] },
  Isabel: { scheme: '30 for time', movements: ['Snatches (135/95 lb)'] },
  Diane: { scheme: '21-15-9 reps for time', movements: ['Deadlifts (225/155 lb)', 'Handstand Push-Ups'] },
  Elizabeth: { scheme: '21-15-9 reps for time', movements: ['Cleans (135/95 lb)', 'Ring Dips'] },
  Karen: { scheme: '150 for time', movements: ['Wall Balls (20/14 lb)'] },
  Annie: { scheme: '50-40-30-20-10 reps for time', movements: ['Double-Unders', 'Sit-Ups'] },
  Cindy: { scheme: 'AMRAP 20', movements: ['5 Pull-Ups', '10 Push-Ups', '15 Air Squats'] },
};

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

  it('renders two distinct real benchmark prescriptions in the panel, each with its label', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/providers').flush({ google: false });

    const el: HTMLElement = fixture.nativeElement.querySelector('[data-testid="login-benchmark"]');
    expect(el).withContext('benchmark block must render').not.toBeNull();

    const cmp = fixture.componentInstance;
    const [first, second] = cmp.benchmarks;

    // The property most likely to regress if the picker is "simplified" back to two independent
    // random draws: they must never land on the same workout twice.
    expect(first.name).withContext('the two boards must not be the same benchmark')
      .not.toBe(second.name);

    const boards = Array.from(el.querySelectorAll('.benchmark-board'));
    expect(boards.length).withContext('exactly two boards must render').toBe(2);

    [first, second].forEach((b, i) => {
      const known = KNOWN_BENCHMARKS[b.name];
      // A regression rendering an empty/malformed entry (name not in the known list, or its own
      // scheme/movements drifting from the seeded data) fails here — a weaker "some text exists"
      // assertion would pass regardless of what actually rendered.
      expect(known).withContext(`"${b.name}" must be a known seeded benchmark`).toBeDefined();
      expect(b.scheme).toBe(known.scheme);
      expect(b.movements).toEqual(known.movements);

      const board = boards[i];
      const label = board.querySelector('.benchmark-label')!.textContent!.replace(/\s+/g, ' ').trim();
      expect(label).toBe(`Benchmark ${b.name}`);

      const scheme = board.querySelector('.benchmark-scheme')!.textContent!.trim();
      expect(scheme).toBe(b.scheme);

      const lines = Array.from(board.querySelectorAll('.benchmark-line')).map(n => n.textContent!.trim());
      expect(lines).toEqual([...b.movements]);
    });

    // Not proven here: that the pair is drawn uniformly at random across runs (a single test run
    // only ever sees one pair), and this Karma spec cannot see the CSS media query that hides the
    // block below 720px — that was checked in a real browser instead.
    expect(el.querySelector('.benchmark-rule')).withContext('a rule must separate the two boards').not.toBeNull();
  });

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
