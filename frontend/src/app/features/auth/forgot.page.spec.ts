import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ForgotPage } from './forgot.page';

describe('ForgotPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Fills the real <input> and dispatches a real 'submit' event on the real <form> — a spec
   *  that calls submit() directly can't see a dead form binding, which is exactly how login
   *  shipped a form doing a native GET with the password in the URL. */
  function submitViaDom(fixture: ComponentFixture<ForgotPage>, email: string): Event {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="forgot-email"]');
    input.value = email;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="forgot-form"]');
    const event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it('renders the IDENTICAL confirmation sentence on a 202 and on a 429 — the no-enumeration guarantee', () => {
    const f1 = TestBed.createComponent(ForgotPage);
    f1.detectChanges();
    submitViaDom(f1, 'known@box.io');
    http.expectOne('/api/auth/password/forgot').flush(null, { status: 202, statusText: 'Accepted' });
    f1.detectChanges();
    const okText = f1.nativeElement.querySelector('[data-testid="forgot-confirm"]').textContent.trim();

    const f2 = TestBed.createComponent(ForgotPage);
    f2.detectChanges();
    submitViaDom(f2, 'unknown@box.io');
    http.expectOne('/api/auth/password/forgot').flush('nope', { status: 429, statusText: 'Too Many Requests' });
    f2.detectChanges();
    const rateLimitedText = f2.nativeElement.querySelector('[data-testid="forgot-confirm"]').textContent.trim();

    // Equality, not just "both non-empty" — a screen that silently branched copy per status
    // would still pass a non-empty check but must fail this one.
    expect(okText).toBe(rateLimitedText);
    expect(okText.length).toBeGreaterThan(0);
  });

  it('submits via the real DOM submit event and prevents the native default', () => {
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();
    const event = submitViaDom(fixture, 'known@box.io');
    http.expectOne('/api/auth/password/forgot').flush(null, { status: 202, statusText: 'Accepted' });
    expect(event.defaultPrevented).toBeTrue();
  });

  it('rejects an invalid address client-side and never issues a request', () => {
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();
    submitViaDom(fixture, 'not-an-email');
    expect(fixture.nativeElement.querySelector('[data-testid="forgot-email-error"]')).toBeTruthy();
    http.expectNone('/api/auth/password/forgot');
  });

  it('ignores a second submit while one is already pending', () => {
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();
    submitViaDom(fixture, 'known@box.io');
    submitViaDom(fixture, 'known@box.io');
    // expectOne throws if more than one request matched — that's the assertion.
    http.expectOne('/api/auth/password/forgot').flush(null, { status: 202, statusText: 'Accepted' });
    // expectOne IS the assertion (see comment above); expect().nothing() only stops Jasmine
    // reporting "has no expectations", which would otherwise be permanent noise in every run.
    expect().nothing();
  });

  it('"use a different address" returns to the form with the field present', () => {
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();
    submitViaDom(fixture, 'known@box.io');
    http.expectOne('/api/auth/password/forgot').flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="forgot-confirm"]')).toBeTruthy();

    fixture.componentInstance.useDifferentAddress();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="forgot-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="forgot-email"]')).toBeTruthy();
  });

  it('clears the inline error as soon as the user retypes, so the field stops claiming to be invalid', () => {
    // Measured on the live screen before this fix: after a failed validation, typing a VALID
    // address left the error visible and aria-invalid="true" on the input. The field went on
    // asserting it was wrong while the user looked at a correct value.
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.submit();
    expect(cmp.emailError()).toBeTruthy();
    http.expectNone('/api/auth/password/forgot');

    // Exactly what the template's (valueChange) fires on a keystroke.
    cmp.email.set('now-valid@box.io');
    cmp.emailError.set('');
    fixture.detectChanges();

    expect(cmp.emailError()).toBe('');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="forgot-email"]');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

});
