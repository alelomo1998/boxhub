import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { ResetPage } from './reset.page';

describe('ResetPage', () => {
  let http: HttpTestingController;

  function setup(token: string | null = 'tok-1') {
    TestBed.configureTestingModule({
      imports: [ResetPage],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(ResetPage);
  }

  afterEach(() => http.verify());

  it('reuses the shared password-error mapping — same sentence as signup', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.password = 'short';
    cmp.submit();
    http.expectOne('/api/auth/password/reset').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
  });

  it('shows an expired state on 410, with the password preserved', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.password = 'a-new-password';
    cmp.submit();
    http.expectOne('/api/auth/password/reset').flush('gone', { status: 410, statusText: 'Gone' });

    expect(cmp.expired()).toBeTrue();
    expect(cmp.password).toBe('a-new-password');
  });

  it('treats a missing token as already expired, with no request sent', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.expired()).toBeTrue();
  });
});
