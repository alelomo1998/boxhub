import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ChangeEmailPage } from './change-email.page';

describe('ChangeEmailPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [ChangeEmailPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(ChangeEmailPage);
  }

  /** Fills the real inputs and dispatches a real 'submit' event on the real <form> — a spec that
   *  calls submit() directly can't see a dead form binding, which is exactly how login shipped a
   *  form doing a native GET with the password in the URL. */
  function submitViaDom(fixture: ComponentFixture<ChangeEmailPage>, email: string, password: string): Event {
    const emailInput: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="email-new"]');
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    const passwordInput: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="email-password"]');
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="email-form"]');
    const event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  afterEach(() => http.verify());

  it('submits through a real DOM submit event and prevents the native default', () => {
    // NEGATIVE CONTROL (brief step 3): swapped the template's native (submit) binding for a
    // (click) handler on the button. The request never fired and defaultPrevented stayed false —
    // this spec failed as expected. Reverted after confirming.
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.newEmail.set('new@example.com');
    cmp.currentPassword.set('current-pw-1');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="email-form"]');
    let captured: Event | undefined;
    form.addEventListener('submit', e => (captured = e));
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http.expectOne('/api/me/email').flush(null);
    expect(captured!.defaultPrevented)
      .withContext('or the browser does a native GET with both the password and new email in the URL').toBeTrue();
  });

  it('rejects a malformed new address client-side and issues no request', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.newEmail.set('not-an-email');
    cmp.currentPassword.set('current-pw-1');
    cmp.submit();
    http.expectNone('/api/me/email');
    expect(cmp.newEmailError()).toBeTruthy();
  });

  it('a second submit while one is in flight issues no second request', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.newEmail.set('new@example.com');
    cmp.currentPassword.set('current-pw-1');
    cmp.submit();
    http.expectOne('/api/me/email');
    cmp.submit();
    http.expectNone('/api/me/email');
  });

  it('states the mechanism above the form before the fields', () => {
    const fixture = setup();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('click the link');
    expect(text).toContain('current email keeps working');
  });

  it('EMAIL_TAKEN (409) lands on the new-email field, values preserved', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'taken@example.com', 'current-pw-1');
    http.expectOne('/api/me/email').flush({ detail: 'EMAIL_TAKEN' }, { status: 409, statusText: 'Conflict' });

    const cmp = fixture.componentInstance;
    expect(cmp.newEmailError()).toBe('That address is already in use.');
    expect(cmp.currentPasswordError()).toBe('');
    expect(cmp.formError()).toBe('');
    // Design law v2: input preserved on error, cleared only on success.
    expect(cmp.newEmail()).toBe('taken@example.com');
    expect(cmp.currentPassword()).toBe('current-pw-1');
  });

  it('WRONG_PASSWORD (422) lands on the current-password field', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'new@example.com', 'wrong-pw');
    http.expectOne('/api/me/email').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    const cmp = fixture.componentInstance;
    expect(cmp.currentPasswordError()).toBe('Current password is wrong.');
    expect(cmp.newEmailError()).toBe('');
    expect(cmp.formError()).toBe('');
  });

  it('NO_PASSWORD_SET (409) replaces the form with the Google-only branch', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'new@example.com', 'anything');
    http.expectOne('/api/me/email').flush({ detail: 'NO_PASSWORD_SET' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(fixture.componentInstance.googleOnly()).toBeTrue();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="email-google-only"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="email-form"]')).toBeNull();
    // Angular collapses a whitespace-only text node between adjacent elements — catches a
    // regression back to "...use</span><a>Forgot password</a>" running the words together.
    expect(el.querySelector('[data-testid="email-google-only"]')?.textContent?.trim())
      .toBe('You sign in with Google. To add a password, use Forgot password.');
  });

  it('an unrecognised code lands on the form-level alert, not a field', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'new@example.com', 'current-pw-1');
    http.expectOne('/api/me/email').flush({ detail: 'SOMETHING_WEIRD' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.newEmailError()).toBe('');
    expect(cmp.currentPasswordError()).toBe('');
    expect(cmp.formError()).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="email-error"]')).toBeTruthy();
  });

  it('on success, clears both fields and names the address the confirmation went to', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'new@example.com', 'current-pw-1');
    http.expectOne('/api/me/email').flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.success()).toBe('new@example.com');
    expect(cmp.newEmail()).toBe('');
    expect(cmp.currentPassword()).toBe('');
    const successEl = fixture.nativeElement.querySelector('[data-testid="email-success"]') as HTMLElement;
    expect(successEl).toBeTruthy();
    expect(successEl.textContent).toContain('new@example.com');
  });
});
