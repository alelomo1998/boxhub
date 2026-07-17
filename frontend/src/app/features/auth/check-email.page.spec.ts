import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { CheckEmailPage } from './check-email.page';

describe('CheckEmailPage', () => {
  let http: HttpTestingController;

  function setup(email = 'a@b.io') {
    TestBed.configureTestingModule({
      imports: [CheckEmailPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => email } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(CheckEmailPage);
  }

  afterEach(() => http.verify());

  it('reads the email from the query string', () => {
    const fixture = setup('someone@box.io');
    expect(fixture.componentInstance.email).toBe('someone@box.io');
  });

  it('disables Resend for 60s after a send, then re-enables it', fakeAsync(() => {
    const fixture = setup();
    const cmp = fixture.componentInstance;

    cmp.resend();
    http.expectOne('/api/auth/verify/resend').flush(null, { status: 202, statusText: 'Accepted' });

    expect(cmp.resent()).toBeTrue();
    expect(cmp.disabled()).toBeTrue();

    tick(59_000);
    expect(cmp.disabled()).toBeTrue(); // still cooling down

    tick(1_000); // crosses the 60s mark
    expect(cmp.disabled()).toBeFalse();
  }));
});
