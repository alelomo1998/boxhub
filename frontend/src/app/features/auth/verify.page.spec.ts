import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { VerifyPage } from './verify.page';

describe('VerifyPage', () => {
  let http: HttpTestingController;
  let router: Router;

  function setup(token: string | null = 'tok-1') {
    TestBed.configureTestingModule({
      imports: [VerifyPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    return TestBed.createComponent(VerifyPage);
  }

  // Flushes the /api/auth/verify -> bootstrap (/api/auth/csrf, /api/me) chain that
  // AuthService.verifyEmail's success path runs, handing back the given memberships.
  function flushVerifySuccess(memberships: unknown[]) {
    http.expectOne('/api/auth/verify').flush(null);
    http.expectOne('/api/auth/csrf').flush({});
    tick();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'a@b.io', name: 'A', superadmin: false, memberships });
    tick();
  }

  afterEach(() => http.verify());

  it('POSTs the token on init and shows expired on a 410', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

    expect(fixture.componentInstance.status()).toBe('expired');
  });

  it('shows an error state with no token, and never calls the API', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('error');
    expect(fixture.componentInstance.errorMessage()).toBeTruthy();
  });

  it('shows an invalid-link error on any non-410 failure', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/verify').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.status()).toBe('error');
    expect(fixture.componentInstance.errorMessage()).toBeTruthy();
  });

  it('a resend that 429s shows an error instead of failing silently', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

    const cmp = fixture.componentInstance;
    cmp.resendEmail.set('a@b.io');
    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush({ detail: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.resendPending()).toBeFalse();
    expect(cmp.resendError()).toBeTruthy();
  });

  describe('auto-select on a single membership (M8 fix)', () => {
    // NEGATIVE CONTROL for this describe block: temporarily change the source's
    // `memberships.length === 1` to `=== 99` and rerun — both tests below fail
    // (navigateByUrl is never called with the role route). Reverted after confirming.

    it('one membership selects the box and lands on its role route', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      spyOn(router, 'navigateByUrl');

      flushVerifySuccess([{ boxId: 'box-1', boxName: 'Box', boxSlug: 'box', role: 'COACH', boxStatus: 'ACTIVE' }]);

      http.expectOne('/api/auth/box-token').flush(null);
      tick();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/coach');
    }));

    it("the box-token 403 arm (SUSPENDED/REJECTED box) surfaces an error instead of stranding the user", fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      spyOn(router, 'navigateByUrl');

      flushVerifySuccess([{ boxId: 'box-1', boxName: 'Box', boxSlug: 'box', role: 'BOX_ADMIN', boxStatus: 'SUSPENDED' }]);

      http.expectOne('/api/auth/box-token').flush('forbidden', { status: 403, statusText: 'Forbidden' });
      tick();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
      // Its OWN state, not 'error'. Verification SUCCEEDED — only the box token was refused.
      expect(fixture.componentInstance.status()).toBe('box-unavailable');

      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent!;
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="verify-box-unavailable"]')).not.toBeNull();
      // The actual defect this asserts against: routing here to 'error' printed the heading
      // "Invalid link / Not valid" directly above "this box is unavailable" — the link was
      // never invalid, and the two halves of the screen contradicted each other.
      expect(text).withContext('must not claim the link was invalid').not.toContain('Not valid');
      expect(text).withContext('must not claim the link was invalid').not.toContain('Invalid link');
    }));

    it('multiple memberships still go to the box picker, unselected', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      spyOn(router, 'navigateByUrl');

      flushVerifySuccess([
        { boxId: 'box-1', boxName: 'Box 1', boxSlug: 'box-1', role: 'ATHLETE', boxStatus: 'ACTIVE' },
        { boxId: 'box-2', boxName: 'Box 2', boxSlug: 'box-2', role: 'COACH', boxStatus: 'ACTIVE' },
      ]);

      // No box-token request should ever be made — http.verify() in afterEach would
      // fail this test if one were left pending.
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/boxes');
    }));
  });

  describe('resend cooldown', () => {
    // NEGATIVE CONTROL: change `next - 1` to `next` in the countdown interval (or drop the
    // `disabled.set(true)` call) and rerun — both tests below fail. Reverted after confirming.

    it('disables Resend for 60s after a send, then re-enables it', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

      const cmp = fixture.componentInstance;
      cmp.resendEmail.set('a@b.io');
      cmp.resend();
      http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });

      expect(cmp.resent()).toBeTrue();
      expect(cmp.disabled()).toBeTrue();

      tick(59_000);
      expect(cmp.disabled()).toBeTrue(); // still cooling down

      tick(1_000); // crosses the 60s mark
      expect(cmp.disabled()).toBeFalse();
      discardPeriodicTasks();
    }));

    it('counts the resend cooldown down each second on the button', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

      const cmp = fixture.componentInstance;
      cmp.resendEmail.set('a@b.io');
      cmp.resend();
      http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });

      expect(cmp.secondsLeft()).toBe(60);
      tick(1_000);
      expect(cmp.secondsLeft()).toBe(59);
      tick(10_000);
      expect(cmp.secondsLeft()).toBe(49);
      discardPeriodicTasks();
    }));

    it('clears a previously shown success message when a new resend starts', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

      const cmp = fixture.componentInstance;
      cmp.resendEmail.set('a@b.io');
      cmp.resend();
      http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });
      expect(cmp.resent()).toBeTrue();

      tick(60_000); // clear the cooldown so a second resend is possible
      discardPeriodicTasks();

      cmp.resend();
      // The stale success must be gone the instant a new attempt starts, not just once it resolves.
      expect(cmp.resent()).toBeFalse();
      http.expectOne('/api/auth/verify/resend').flush('boom', { status: 500, statusText: 'Server Error' });
      expect(cmp.resent()).toBeFalse();
      expect(cmp.resendError()).toBeTruthy();
    }));

    it('clears both the cooldown timer and the countdown interval on destroy (no leaked timers)', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

      const cmp = fixture.componentInstance;
      cmp.resendEmail.set('a@b.io');
      cmp.resend();
      http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });
      expect(cmp.disabled()).toBeTrue();

      fixture.destroy();

      // The countdown INTERVAL must be gone. fakeAsync's own end-of-test check does not reliably
      // catch a leaked *periodic* timer, so inspect the zone's periodic queue directly. NOT the
      // one-shot queue — afterNextRender schedules its own timeout there, which is Angular's, not
      // ours, and asserting that queue is empty would be testing the framework.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spec = (window as any).Zone.current.get('FakeAsyncTestZoneSpec');
      expect(spec.pendingPeriodicTimers).withContext('countdown interval leaked').toEqual([]);

      // And the cooldown TIMEOUT must be gone, asserted by behaviour rather than by zone internals:
      // had it survived destroy, it would fire here and flip disabled back to false.
      tick(60_000);
      expect(cmp.disabled()).withContext('cooldown timeout fired after destroy').toBeTrue();
      discardPeriodicTasks();
    }));

    // A Karma spec cannot see the real focus-timing bug (queueMicrotask vs afterNextRender):
    // fixture.detectChanges() forces the render flush synchronously, so both would appear to
    // work here. This only proves the happy-path behaviour completes; the timing regression
    // itself is verified in a real browser.
    it('moves focus onto the result alert after a successful resend', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });
      fixture.detectChanges();

      const cmp = fixture.componentInstance;
      cmp.resendEmail.set('a@b.io');
      const btn = (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>('[data-testid="verify-resend"]')!;
      btn.focus();
      btn.click();
      http.expectOne('/api/auth/verify/resend').flush(null);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      expect(btn.disabled).withContext('cooldown must have disabled the button').toBeTrue();
      expect(document.activeElement)
        .withContext('focus must move to the alert, not fall back to <body>')
        .toBe((fixture.nativeElement as HTMLElement).querySelector('[data-testid="verify-resent"]'));

      discardPeriodicTasks();
    }));
  });
});
