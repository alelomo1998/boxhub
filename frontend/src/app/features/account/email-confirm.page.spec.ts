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

  it('treats a missing token as invalid, with no request sent', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('error');
  });
});
