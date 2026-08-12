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

  it('swaps to the waitlist form when the mode flips to full between load and submit, carrying typed values over', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName.set('Iron Box'); cmp.name.set('Ann'); cmp.email.set('a@b.io'); cmp.password.set('longenoughpw');
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ full: true });

    expect(cmp.mode()).toBe('full');
    expect(cmp.boxName()).toBe('Iron Box');
    expect(cmp.email()).toBe('a@b.io');

    cmp.submitWaitlist();
    http.expectOne('/api/auth/waitlist').flush(null, { status: 202, statusText: 'Accepted' });
    expect(cmp.waitlisted()).toBeTrue();
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
