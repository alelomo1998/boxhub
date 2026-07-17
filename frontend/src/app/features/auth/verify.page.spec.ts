import { TestBed, fakeAsync } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { VerifyPage } from './verify.page';

describe('VerifyPage', () => {
  let http: HttpTestingController;

  function setup(token: string | null = 'tok-1') {
    TestBed.configureTestingModule({
      imports: [VerifyPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(VerifyPage);
  }

  afterEach(() => http.verify());

  it('POSTs the token on init and shows expired on a 410', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

    expect(fixture.componentInstance.status()).toBe('expired');
  });

  it('shows an error state with no token, and never calls the API', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.status()).toBe('error');
  });

  it('a resend that 429s shows an error instead of failing silently', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

    const cmp = fixture.componentInstance;
    cmp.resendEmail = 'a@b.io';
    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush({ detail: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });

    expect(cmp.resendPending()).toBeFalse();
    expect(cmp.resendError()).toBe('Could not resend — try again.');
  });

  it('clears the resend cooldown timer on destroy (no leaked timer)', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/auth/verify').flush('gone', { status: 410, statusText: 'Gone' });

    const cmp = fixture.componentInstance;
    cmp.resendEmail = 'a@b.io';
    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });
    expect(cmp.disabled()).toBeTrue();

    // Destroying before the 60s cooldown elapses must clear the timer — otherwise fakeAsync
    // fails this test with "N timer(s) still in the queue" when the zone flushes.
    fixture.destroy();
  }));
});
