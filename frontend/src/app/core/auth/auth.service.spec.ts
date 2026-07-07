import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login stores tokens and memberships', () => {
    service.login('a@b.io', 'password123').subscribe();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({
      accessToken: 'AT',
      refreshToken: 'RT',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE' }],
    });
    expect(localStorage.getItem('bh_user_token')).toBe('AT');
    expect(localStorage.getItem('bh_refresh_token')).toBe('RT');
    expect(service.memberships().length).toBe(1);
  });

  it('selectBox stores box token and active box', () => {
    service.login('a@b.io', 'password123').subscribe();
    http.expectOne('/api/auth/login').flush({
      accessToken: 'AT', refreshToken: 'RT',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'COACH' }],
    });
    service.selectBox('1').subscribe();
    http.expectOne('/api/auth/box-token').flush({ accessToken: 'BOX-AT' });
    expect(localStorage.getItem('bh_box_token')).toBe('BOX-AT');
    expect(service.activeBox()?.role).toBe('COACH');
  });

  it('logout clears everything', () => {
    localStorage.setItem('bh_user_token', 'x');
    service.logout();
    expect(localStorage.getItem('bh_user_token')).toBeNull();
    expect(service.activeBox()).toBeNull();
  });
});
