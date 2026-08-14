import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { StartBoxPage } from './start-box.page';

describe('StartBoxPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [StartBoxPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(StartBoxPage);
  }

  afterEach(() => http.verify());

  it('renders the signup form when signup mode is open', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    expect(fixture.componentInstance.mode()).toBe('open');
  });

  it('renders the waitlist form when signup mode is not open', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: false });

    expect(fixture.componentInstance.mode()).toBe('full');
  });

  it('shows a retry button when the signup-mode probe fails, and retry re-runs loadMode', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.mode()).toBe('error');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="start-retry"]').click();
    expect(fixture.componentInstance.mode()).toBe('loading');
    http.expectOne('/api/auth/signup-mode').flush({ open: true });
    expect(fixture.componentInstance.mode()).toBe('open');
  });

  it('renders PASSWORD_TOO_SHORT under the password field', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('short');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
    expect(cmp.formError()).toBe('');
  });

  it('renders PASSWORD_BREACHED under the password field', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('password1');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'PASSWORD_BREACHED' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('This password has appeared in a data breach. Choose another one.');
  });

  it('shows a retry-in-a-moment message on 503 SIGNUP_RETRY and preserves input', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'SIGNUP_RETRY' }, { status: 503, statusText: 'Service Unavailable' });

    expect(cmp.formError()).toBe('Try again in a moment.');
    expect(cmp.boxName()).toBe('Iron Box');
    expect(cmp.email()).toBe('a@b.io');
    expect(cmp.password()).toBe('longenoughpw');
  });

  it('shows a generic form error for an unmapped backend code', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'SOMETHING_ODD' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.formError()).toBe('Something went wrong — try again.');
    expect(cmp.passwordError()).toBe('');
  });

  it('routes a field validation error to the correct field and does NOT show the generic alert', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set(''); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush(
      { detail: 'Validation failed', errors: { boxName: 'must not be blank' } },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(cmp.boxNameError()).toBe("Enter your gym's name.");
    // Both halves matter: a field message alone would also pass with the double-message bug back.
    expect(cmp.formError()).toBe('');
    expect(fixture.nativeElement.querySelector('[data-testid="start-error"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="start-box-name-error"]').textContent)
      .toContain("Enter your gym's name.");
  });

  it('clears a stale field error on a second submit', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set(''); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush(
      { detail: 'Validation failed', errors: { boxName: 'must not be blank' } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(cmp.boxNameError()).toBe("Enter your gym's name.");

    cmp.boxName.set('Iron Box');
    cmp.submit();
    // submit() clears every field signal synchronously, before the request even resolves.
    expect(cmp.boxNameError()).withContext('stale error must clear at the start of resubmit').toBe('');

    http.expectOne('/api/auth/signup-box').flush(null, { status: 201, statusText: 'Created' });
  });

  it('PASSWORD_TOO_SHORT (arriving as detail) wins over a generically mapped password field error', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('short');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush(
      { detail: 'PASSWORD_TOO_SHORT', errors: { password: 'size must be between 10 and 100' } },
      { status: 400, statusText: 'Bad Request' },
    );

    // Not the generic mapped copy — the more specific password-policy sentence.
    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
  });

  it('SIGNUP_RETRY (503) keeps its own message and is NOT replaced by field mapping, even ' +
     'when an errors map rides along', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    // SIGNUP_RETRY returns early in the component, before fieldErrorMessages() ever runs — an
    // errors map present alongside it must be ignored entirely, not partially applied.
    http.expectOne('/api/auth/signup-box').flush(
      { detail: 'SIGNUP_RETRY', errors: { boxName: 'must not be blank' } },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(cmp.formError()).toBe('Try again in a moment.');
    expect(cmp.boxNameError()).toBe('');
  });

  it('swaps to the waitlist form when the mode flips to full between load and submit, carrying typed values over, and explains the flip', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ full: true });
    fixture.detectChanges();

    expect(cmp.mode()).toBe('full');
    expect(cmp.boxName()).toBe('Iron Box');
    expect(cmp.email()).toBe('a@b.io');
    // The whole point of the fix: someone who just typed four fields and watched the platform
    // flip under them mid-submit gets told so — not left staring at a shorter form in silence.
    expect(fixture.nativeElement.querySelector('[data-testid="start-waitlist-flip-notice"]'))
      .withContext('a submit-caused flip must render the explanation')
      .not.toBeNull();

    cmp.submitWaitlist();
    http.expectOne('/api/auth/waitlist').flush(null, { status: 202, statusText: 'Accepted' });
    expect(cmp.waitlisted()).toBeTrue();
  });

  it('does NOT show the flip notice on a cold load into a closed platform', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: false });
    fixture.detectChanges();

    // Same 'full' mode as the flip case, but reached by landing on the page directly — the
    // "we just filled up while you were typing" message would be false here and must not show.
    expect(fixture.componentInstance.mode()).toBe('full');
    expect(fixture.componentInstance.flippedFromSubmit()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[data-testid="start-waitlist-flip-notice"]')).toBeNull();
  });

  it('offers a way back to login from the waitlist success state', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: false });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.email.set('a@b.io');
    cmp.submitWaitlist();
    http.expectOne('/api/auth/waitlist').flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('[data-testid="start-waitlist-back-to-login"]');
    expect(link).withContext('waitlist success must not be a dead end').not.toBeNull();
    expect(link.getAttribute('href')).toBe('/auth/login');
  });

  it('shows a generic form error when the waitlist submit fails', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: false });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.email.set('a@b.io');
    cmp.submitWaitlist();
    http.expectOne('/api/auth/waitlist').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(cmp.formError()).toBe('Something went wrong — try again.');
    expect(cmp.waitlisted()).toBeFalse();
  });

  it('clicking the open form submit button fires submit() via a real DOM submit and prevents the native GET-with-password-in-URL submit', () => {
    // Regression for the P0 that shipped once on login: (ngSubmit) silently binds to nothing once
    // FormsModule/NgForm is gone, so a suite calling cmp.submit() directly — never dispatching a
    // real DOM event — stays green while the button is completely dead. This only proves something
    // by exercising the actual click-to-submit path and checking defaultPrevented.
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    spyOn(cmp, 'submit').and.callThrough();
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="start-form"]');
    let captured: Event | undefined;
    form.addEventListener('submit', e => (captured = e));
    const submitBtn: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
    submitBtn.click();

    expect(cmp.submit).withContext('the component handler must run').toHaveBeenCalled();
    expect(captured).withContext('a real submit event must reach the form').toBeDefined();
    expect(captured!.defaultPrevented)
      .withContext('preventDefault must fire, or the browser performs a native GET with the password in the URL')
      .toBeTrue();

    http.expectOne('/api/auth/signup-box').flush(null, { status: 201, statusText: 'Created' });
  });

  it('clicking the waitlist submit button fires submitWaitlist() via a real DOM submit and prevents the native GET submit', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: false });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    spyOn(cmp, 'submitWaitlist').and.callThrough();
    cmp.boxName.set('Iron Box'); cmp.email.set('a@b.io');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="waitlist-form"]');
    let captured: Event | undefined;
    form.addEventListener('submit', e => (captured = e));
    const submitBtn: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
    submitBtn.click();

    expect(cmp.submitWaitlist).withContext('the component handler must run').toHaveBeenCalled();
    expect(captured).withContext('a real submit event must reach the form').toBeDefined();
    expect(captured!.defaultPrevented)
      .withContext('preventDefault must fire, or the browser performs a native GET submit')
      .toBeTrue();

    http.expectOne('/api/auth/waitlist').flush(null, { status: 202, statusText: 'Accepted' });
  });
});
