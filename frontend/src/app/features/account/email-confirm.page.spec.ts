import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { EmailConfirmPage } from './email-confirm.page';

describe('EmailConfirmPage', () => {
  let http: HttpTestingController;

  function setup(token: string | null = 'tok-1') {
    TestBed.configureTestingModule({
      imports: [EmailConfirmPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(EmailConfirmPage);
  }

  afterEach(() => http.verify());

  it('posts the query-param token to /api/me/email/confirm and shows done on success', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    const req = http.expectOne('/api/me/email/confirm');
    expect(req.request.body).toEqual({ token: 'tok-1' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(fixture.componentInstance.status()).toBe('done');
  });

  it('shows expired on a 410', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    http.expectOne('/api/me/email/confirm').flush('gone', { status: 410, statusText: 'Gone' });

    expect(fixture.componentInstance.status()).toBe('expired');
  });

  it('shows error on a non-410 failure', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    http.expectOne('/api/me/email/confirm').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.status()).toBe('error');
  });

  // Negative control run and confirmed: with `if (!this.token) { ... }` in ngOnInit commented out
  // (so a missing token fell through to the request path), this test failed on
  // `http.expectNone(...)` — "Expected no open requests, found 1: POST /api/me/email/confirm".
  // Reverted before this file was left in place.
  it('treats a missing token as invalid, with no request sent', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('error');
    http.expectNone('/api/me/email/confirm');
  });

  // Negative control run and confirmed: with the `done` case's `<a routerLink>` footer paragraph
  // deleted from the template, this test failed on
  // `expect(...).toBeTruthy()` — "Expected null to be truthy" for email-confirm-done-login.
  // Reverted before this file was left in place.
  it('renders a "Go to login" exit and no volt bh-button in done', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    http.expectOne('/api/me/email/confirm').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="email-confirm-done-login"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('bh-button')).toBeNull();
  });

  it('renders a "Go to login" exit and no volt bh-button in expired', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    http.expectOne('/api/me/email/confirm').flush('gone', { status: 410, statusText: 'Gone' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="email-confirm-expired-login"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('bh-button')).toBeNull();
  });

  it('renders a "Go to login" exit and no volt bh-button in error', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    http.expectOne('/api/me/email/confirm').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="email-confirm-error-login"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('bh-button')).toBeNull();
  });

  it('renders no volt bh-button while pending', () => {
    const fixture = setup('tok-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('bh-button')).toBeNull();
    http.expectOne('/api/me/email/confirm').flush(null, { status: 204, statusText: 'No Content' });
  });
});
