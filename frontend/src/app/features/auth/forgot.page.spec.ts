import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ForgotPage } from './forgot.page';

describe('ForgotPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const CONFIRM = "If that address has an account, we've sent a reset link.";

  it('shows the same confirmation on a 202', () => {
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.email = 'known@box.io';
    cmp.submit();
    http.expectOne('/api/auth/password/forgot').flush(null, { status: 202, statusText: 'Accepted' });

    fixture.detectChanges();
    expect(cmp.submitted()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain(CONFIRM);
  });

  it('shows the exact same confirmation even when the request errors — no enumeration branch', () => {
    const fixture = TestBed.createComponent(ForgotPage);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.email = 'unknown@box.io';
    cmp.submit();
    http.expectOne('/api/auth/password/forgot').flush('nope', { status: 429, statusText: 'Too Many Requests' });

    fixture.detectChanges();
    expect(cmp.submitted()).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain(CONFIRM);
  });
});
