import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SignupPage } from './signup.page';

describe('SignupPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SignupPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushProviders(google = false) {
    http.expectOne('/api/auth/providers').flush({ google });
  }

  it('renders PASSWORD_TOO_SHORT under the password field, not at the top of the form', () => {
    const fixture = TestBed.createComponent(SignupPage);
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.io'; cmp.password = 'short'; cmp.name = 'Ann';
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
    expect(cmp.formError()).toBe('');
  });

  it('renders PASSWORD_BREACHED under the password field', () => {
    const fixture = TestBed.createComponent(SignupPage);
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.io'; cmp.password = 'password1'; cmp.name = 'Ann';
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_BREACHED' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('This password has appeared in a data breach. Choose another one.');
  });

  it('preserves name/email/password after an error — nothing is cleared', () => {
    const fixture = TestBed.createComponent(SignupPage);
    fixture.detectChanges();
    flushProviders();

    const cmp = fixture.componentInstance;
    cmp.email = 'a@b.io'; cmp.password = 'short'; cmp.name = 'Ann';
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.email).toBe('a@b.io');
    expect(cmp.password).toBe('short');
    expect(cmp.name).toBe('Ann');
  });

  it('shows the Google button only when the backend advertises it', () => {
    const fixture = TestBed.createComponent(SignupPage);
    fixture.detectChanges();
    flushProviders(true);
    expect(fixture.componentInstance.showGoogle()).toBeTrue();
  });
});
