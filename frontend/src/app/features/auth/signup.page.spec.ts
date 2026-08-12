import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SignupPage } from './signup.page';

describe('SignupPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [SignupPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(SignupPage);
  }

  afterEach(() => http.verify());

  function flushProviders(google = false) {
    http.expectOne('/api/auth/providers').flush({ google });
  }

  it('default: renders the form with no errors and the invite note visible', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="signup-form"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="signup-error"]')).toBeNull();
    expect(el.textContent).toContain("You'll need an invite from your gym");
  });

  it('renders the benchmark board under its own testId, same as login', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const el: HTMLElement = fixture.nativeElement.querySelector('[data-testid="signup-benchmark"]');
    expect(el).withContext('benchmark block must render').not.toBeNull();
    expect(el.querySelectorAll('.benchmark-board').length).toBe(2);
  });

  it('renders PASSWORD_TOO_SHORT under the password field, not at the top of the form', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('short'); cmp.name.set('Ann');
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
    expect(cmp.formError()).toBe('');
  });

  it('renders PASSWORD_BREACHED under the password field', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('password1'); cmp.name.set('Ann');
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_BREACHED' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('This password has appeared in a data breach. Choose another one.');
  });

  it('shows a generic form error for an unmapped backend code', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('whatever12'); cmp.name.set('Ann');
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'SOMETHING_ODD' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.formError()).toBe('Something went wrong — try again.');
    expect(cmp.passwordError()).toBe('');
  });

  it('preserves name/email/password after an error — nothing is cleared', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('short'); cmp.name.set('Ann');
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.email()).toBe('a@b.io');
    expect(cmp.password()).toBe('short');
    expect(cmp.name()).toBe('Ann');
  });

  it('submitting: sets pending while the register call is in flight, and clears it after', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('whatever12'); cmp.name.set('Ann');
    cmp.submit();

    expect(cmp.pending()).toBeTrue();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });
    expect(cmp.pending()).toBeFalse();
  });

  it('a successful register always navigates to check-email with the address attached (201-always, no enumeration)', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    const cmp = fixture.componentInstance;
    cmp.email.set('a@b.io'); cmp.password.set('whatever12'); cmp.name.set('Ann');
    cmp.submit();
    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });

    expect(navSpy).toHaveBeenCalledWith(['/auth/check-email'], { queryParams: { email: 'a@b.io' } });
  });

  it('shows the Google button only when the backend advertises it', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders(true);
    fixture.detectChanges();

    expect(fixture.componentInstance.showGoogle()).toBeTrue();
    expect(fixture.nativeElement.querySelector('[data-testid="signup-google"]')).not.toBeNull();
  });

  it('Google hidden: both the button and the divider are absent when the backend does not advertise it', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushProviders(false);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(fixture.componentInstance.showGoogle()).toBeFalse();
    expect(el.querySelector('[data-testid="signup-google"]')).toBeNull();
    expect(el.textContent).not.toContain('OR CONTINUE WITH');
  });

  it('clicking the submit button fires submit() and prevents the native GET-with-password-in-URL submit', () => {
    // Regression for the P0 that shipped once on login: (ngSubmit) silently binds to nothing once
    // FormsModule/NgForm is gone, so a suite calling cmp.submit() directly — never dispatching a
    // real DOM event — stays green while the button is completely dead. This only proves something
    // by exercising the actual click-to-submit path and checking defaultPrevented.
    const fixture = setup();
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    spyOn(cmp, 'submit').and.callThrough();
    cmp.email.set('a@b.io');
    cmp.password.set('whatever12');
    cmp.name.set('Ann');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="signup-form"]');
    let captured: Event | undefined;
    form.addEventListener('submit', e => (captured = e));
    const submitBtn: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
    submitBtn.click();

    expect(cmp.submit).withContext('the component handler must run').toHaveBeenCalled();
    expect(captured).withContext('a real submit event must reach the form').toBeDefined();
    expect(captured!.defaultPrevented)
      .withContext('preventDefault must fire, or the browser performs a native GET with the password in the URL')
      .toBeTrue();

    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
  });
});
