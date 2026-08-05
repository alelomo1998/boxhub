import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { StartBoxPage } from './start-box.page';

describe('StartBoxPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StartBoxPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders the signup form when signup mode is open', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    expect(fixture.componentInstance.mode()).toBe('open');
  });

  it('renders the waitlist form when signup mode is not open', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: false });

    expect(fixture.componentInstance.mode()).toBe('full');
  });

  it('shows a retry button when the signup-mode probe fails', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.mode()).toBe('error');
  });

  it('renders PASSWORD_TOO_SHORT under the password field', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName = 'Iron Box'; cmp.name = 'Ann'; cmp.email = 'a@b.io'; cmp.password = 'short';
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
    expect(cmp.formError()).toBe('');
  });

  it('renders PASSWORD_BREACHED under the password field', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName = 'Iron Box'; cmp.name = 'Ann'; cmp.email = 'a@b.io'; cmp.password = 'password1';
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'PASSWORD_BREACHED' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('This password has appeared in a data breach. Choose another one.');
  });

  it('shows a retry-in-a-moment message on 503 SIGNUP_RETRY and preserves input', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName = 'Iron Box'; cmp.name = 'Ann'; cmp.email = 'a@b.io'; cmp.password = 'longenoughpw';
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ detail: 'SIGNUP_RETRY' }, { status: 503, statusText: 'Service Unavailable' });

    expect(cmp.formError()).toBe('Try again in a moment.');
    expect(cmp.boxName).toBe('Iron Box');
    expect(cmp.email).toBe('a@b.io');
    expect(cmp.password).toBe('longenoughpw');
  });

  it('swaps to the waitlist form when the mode flips to full between load and submit, carrying typed values over', () => {
    const fixture = TestBed.createComponent(StartBoxPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/signup-mode').flush({ open: true });

    const cmp = fixture.componentInstance;
    cmp.boxName = 'Iron Box'; cmp.name = 'Ann'; cmp.email = 'a@b.io'; cmp.password = 'longenoughpw';
    cmp.submit();
    http.expectOne('/api/auth/signup-box').flush({ full: true });

    expect(cmp.mode()).toBe('full');
    expect(cmp.boxName).toBe('Iron Box');
    expect(cmp.email).toBe('a@b.io');

    cmp.submitWaitlist();
    http.expectOne('/api/auth/waitlist').flush(null, { status: 202, statusText: 'Accepted' });
    expect(cmp.waitlisted()).toBeTrue();
  });
});
