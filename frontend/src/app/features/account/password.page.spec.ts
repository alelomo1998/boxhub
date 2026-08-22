import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PasswordPage } from './password.page';

describe('PasswordPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [PasswordPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(PasswordPage);
  }

  /** Fills the real inputs and dispatches a real 'submit' event on the real <form> — a spec that
   *  calls submit() directly can't see a dead form binding, which is exactly how login shipped a
   *  form doing a native GET with the password in the URL. */
  function submitViaDom(fixture: ComponentFixture<PasswordPage>, current: string, next: string): Event {
    const curInput: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="password-current"]');
    curInput.value = current;
    curInput.dispatchEvent(new Event('input'));
    const newInput: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="password-new"]');
    newInput.value = next;
    newInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="password-form"]');
    const event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  afterEach(() => http.verify());

  it('submits through a real DOM submit event and prevents the native default', () => {
    // NEGATIVE CONTROL (brief step 6): swapped the template's native (submit) binding for a
    // (click) handler on the button. The request never fired and defaultPrevented stayed false —
    // this spec failed as expected. Reverted after confirming.
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.currentPassword.set('old-password-1');
    cmp.newPassword.set('new-password-12');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="password-form"]');
    let captured: Event | undefined;
    form.addEventListener('submit', e => (captured = e));
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();

    http.expectOne('/api/me/password').flush(null);
    expect(captured!.defaultPrevented)
      .withContext('or the browser does a native GET with both passwords in the URL').toBeTrue();
  });

  it('rejects a 9-character new password client-side and issues no request', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.currentPassword.set('old-password-1');
    cmp.newPassword.set('123456789');
    cmp.submit();
    http.expectNone('/api/me/password');
    expect(cmp.newPasswordError()).toBeTruthy();
  });

  it('states both consequences before the button', () => {
    const fixture = setup();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('other devices');
    expect(text).toContain('email');
  });

  it('a second submit while one is in flight issues no second request', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.currentPassword.set('old-password-1');
    cmp.newPassword.set('new-password-12');
    cmp.submit();
    http.expectOne('/api/me/password');
    cmp.submit();
    http.expectNone('/api/me/password');
    // expectNone IS the assertion — it throws if a second request fired. expect().nothing()
    // only stops Jasmine reporting "has no expectations" as permanent noise.
    expect().nothing();
  });

  it('WRONG_PASSWORD lands on the current-password field, values preserved', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'wrong-current', 'new-password-12');
    http.expectOne('/api/me/password').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    const cmp = fixture.componentInstance;
    expect(cmp.currentPasswordError()).toBe('Current password is wrong.');
    expect(cmp.newPasswordError()).toBe('');
    expect(cmp.formError()).toBe('');
    // Design law v2: input preserved on error, cleared only on success.
    expect(cmp.currentPassword()).toBe('wrong-current');
    expect(cmp.newPassword()).toBe('new-password-12');
  });

  it('NO_PASSWORD_SET (409) replaces the form with the Google-only branch', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'anything', 'new-password-12');
    http.expectOne('/api/me/password').flush({ detail: 'NO_PASSWORD_SET' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(fixture.componentInstance.googleOnly()).toBeTrue();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="password-google-only"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="password-form"]')).toBeNull();
    // Angular collapses a whitespace-only text node between adjacent elements — catches a
    // regression back to "...use</span><a>Forgot password</a>" running the words together.
    expect(el.querySelector('[data-testid="password-google-only"]')?.textContent?.trim())
      .toBe('You sign in with Google. To add a password, use Forgot password.');
  });

  it('PASSWORD_TOO_SHORT (400) lands on the new-password field via the shared mapping', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'old-password-1', 'new-password-12');
    http.expectOne('/api/me/password').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    const cmp = fixture.componentInstance;
    expect(cmp.newPasswordError()).toBe('Use at least 10 characters.');
    expect(cmp.currentPasswordError()).toBe('');
    expect(cmp.formError()).toBe('');
  });

  it('an unrecognised code lands on the form-level alert, not a field', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'old-password-1', 'new-password-12');
    http.expectOne('/api/me/password').flush({ detail: 'SOMETHING_WEIRD' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.currentPasswordError()).toBe('');
    expect(cmp.newPasswordError()).toBe('');
    expect(cmp.formError()).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="password-error"]')).toBeTruthy();
  });

  it('on success, clears both fields and shows the confirmation', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'old-password-1', 'new-password-12');
    http.expectOne('/api/me/password').flush(null);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.success()).toBeTrue();
    expect(cmp.currentPassword()).toBe('');
    expect(cmp.newPassword()).toBe('');
    expect(fixture.nativeElement.querySelector('[data-testid="password-success"]')).toBeTruthy();
  });
});
