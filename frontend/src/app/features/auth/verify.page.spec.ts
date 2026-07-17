import { TestBed } from '@angular/core/testing';
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
});
