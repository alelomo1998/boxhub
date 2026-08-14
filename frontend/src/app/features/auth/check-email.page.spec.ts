import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { CheckEmailPage } from './check-email.page';

describe('CheckEmailPage', () => {
  let http: HttpTestingController;

  function setup(email = 'a@b.io') {
    TestBed.configureTestingModule({
      imports: [CheckEmailPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => email } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(CheckEmailPage);
  }

  afterEach(() => http.verify());

  it('reads the email from the query string', () => {
    const fixture = setup('someone@box.io');
    expect(fixture.componentInstance.email).toBe('someone@box.io');
  });

  it('renders the address-present copy when email is set', () => {
    const fixture = setup('someone@box.io');
    fixture.detectChanges();
    const copy = fixture.nativeElement.querySelector('[data-testid="check-email-copy"]');
    expect(copy.textContent).toContain('someone@box.io');
  });

  it('renders the address-empty copy without a placeholder when email is missing', () => {
    const fixture = setup('');
    fixture.detectChanges();
    const copy = fixture.nativeElement.querySelector('[data-testid="check-email-copy"]');
    expect(copy.textContent).not.toContain('undefined');
    expect(copy.textContent).not.toContain('null');
    expect(copy.textContent.trim().length).toBeGreaterThan(0);
  });

  it('disables Resend for 60s after a send, then re-enables it', fakeAsync(() => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

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
    const cmp = fixture.componentInstance;

    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });

    expect(cmp.secondsLeft()).toBe(60);
    tick(1_000);
    expect(cmp.secondsLeft()).toBe(59);
    tick(10_000);
    expect(cmp.secondsLeft()).toBe(49);
    discardPeriodicTasks();
  }));

  it('shows a danger alert and clears resendPending on a failed resend', fakeAsync(() => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.resend();
    expect(cmp.resendPending()).toBeTrue();
    http.expectOne('/api/auth/verify/resend').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(cmp.resendPending()).toBeFalse();
    expect(cmp.resendError()).toBeTruthy();
    expect(cmp.disabled()).toBeFalse();
  }));

  it('clears a previously shown success message when a new resend starts', fakeAsync(() => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

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
    const cmp = fixture.componentInstance;

    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });
    expect(cmp.disabled()).toBeTrue();

    fixture.destroy();

    // Destroying before the 60s cooldown elapses must clear BOTH timers, or one leaks into the
    // zone's pending-timer queue for the rest of the suite. fakeAsync's own end-of-test check
    // does not reliably catch a leaked *periodic* timer (verified: it stayed green with the
    // interval leaking), so inspect the zone's timer queues directly instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spec = (window as any).Zone.current.get('FakeAsyncTestZoneSpec');
    expect(spec.pendingPeriodicTimers).toEqual([]);
    expect(spec.pendingTimers).toEqual([]);
  }));

  it('moves focus onto the result alert, because the cooldown removes the pressed button from the a11y tree', fakeAsync(() => {
    const fixture = setup('a@b.io');
    fixture.detectChanges();

    const btn = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="check-email-resend"]')!;
    btn.focus();
    btn.click();
    http.expectOne('/api/auth/verify/resend').flush(null);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    // The button is now natively disabled by the cooldown, so focus CANNOT still be on it —
    // without the explicit move it lands on <body> and the user tabs from the top of the page.
    expect(btn.disabled).withContext('cooldown must have disabled the button').toBeTrue();
    expect(document.activeElement)
      .withContext('focus must move to the alert, not fall back to <body>')
      .toBe((fixture.nativeElement as HTMLElement).querySelector('[data-testid="check-email-resent"]'));

    discardPeriodicTasks();
  }));
});
