import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  function setup(errorParam: string | null = null) {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
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
});
