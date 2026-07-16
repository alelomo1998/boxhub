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
    service.login('a@b.io', 'correct-horse-battery').subscribe();
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
    service.login('a@b.io', 'correct-horse-battery').subscribe();
    http.expectOne('/api/auth/login').flush({
      accessToken: 'AT', refreshToken: 'RT',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'COACH' }],
    });
    service.selectBox('1').subscribe();
    http.expectOne('/api/auth/box-token').flush({ accessToken: 'BOX-AT' });
    expect(localStorage.getItem('bh_box_token')).toBe('BOX-AT');
    expect(service.activeBox()?.role).toBe('COACH');
  });

  it('refresh then selectBox chain renews box token (interceptor contract)', () => {
    // login + select box to establish active box state
    service.login('a@b.io', 'correct-horse-battery').subscribe();
    http.expectOne('/api/auth/login').flush({
      accessToken: 'AT', refreshToken: 'RT',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE' }],
    });
    service.selectBox('1').subscribe();
    http.expectOne('/api/auth/box-token').flush({ accessToken: 'BOX-AT-1' });

    // refresh rotates user token; a follow-up selectBox must be possible and update the box token
    service.refresh().subscribe();
    http.expectOne('/api/auth/refresh').flush({
      accessToken: 'AT-2', refreshToken: 'RT-2',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE' }],
    });
    service.selectBox('1').subscribe();
    http.expectOne('/api/auth/box-token').flush({ accessToken: 'BOX-AT-2' });
    expect(localStorage.getItem('bh_box_token')).toBe('BOX-AT-2');
  });

  it('refresh updates memberships signal', () => {
    service.refresh; // type presence
    localStorage.setItem('bh_refresh_token', 'RT');
    service.refresh().subscribe(ok => expect(ok).toBeTrue());
    http.expectOne('/api/auth/refresh').flush({
      accessToken: 'AT2', refreshToken: 'RT2',
      memberships: [{ boxId: '9', boxName: 'New', boxSlug: 'new', role: 'ATHLETE' }],
    });
    expect(service.memberships().length).toBe(1);
    expect(service.memberships()[0].boxId).toBe('9');
  });

  it('logout clears everything', () => {
    localStorage.setItem('bh_user_token', 'x');
    service.logout();
    expect(localStorage.getItem('bh_user_token')).toBeNull();
    expect(service.activeBox()).toBeNull();
  });
});

describe('AuthService (corrupt localStorage)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('bh_memberships', '{not-json');
    localStorage.setItem('bh_active_box', '<garbage>');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    http = TestBed.inject(HttpTestingController);
    http.verify();
    localStorage.clear();
  });

  it('survives corrupt localStorage values', () => {
    const service = TestBed.inject(AuthService);
    expect(service.memberships()).toEqual([]);
    expect(service.activeBox()).toBeNull();
    expect(localStorage.getItem('bh_memberships')).toBeNull();
  });
});
