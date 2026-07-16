import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
const NO_CONTENT = { status: 204, statusText: 'No Content' };
const membership = { boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE' as const };

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => httpMock.verify());

  it('re-mints the box token after a refresh when a box is active', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let result: unknown;
    http.get('/api/box/something').subscribe(r => (result = r));

    httpMock.expectOne('/api/box/something').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);

    const boxTokenReq = httpMock.expectOne('/api/auth/box-token');
    expect(boxTokenReq.request.body).toEqual({ boxId: '1' });
    boxTokenReq.flush(null, NO_CONTENT);

    httpMock.expectOne('/api/box/something').flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('does not re-mint the box token when no box is active', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [membership] });

    let result: unknown;
    http.get('/api/box/something').subscribe(r => (result = r));

    httpMock.expectOne('/api/box/something').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);
    httpMock.expectNone('/api/auth/box-token');

    httpMock.expectOne('/api/box/something').flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('gives up cleanly when the box-token re-mint fails', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let error: unknown;
    http.get('/api/box/something').subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/box/something').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);
    httpMock.expectOne('/api/auth/box-token').flush('unauthorized', UNAUTHORIZED);

    expect(error).toBeTruthy();
    expect(auth.session()).toBeNull();
  });

  it('clears session, activeBox, and localStorage when the refresh itself fails', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });
    localStorage.setItem('bh_active_box', JSON.stringify({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' }));

    let error: unknown;
    http.get('/api/box/something').subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/box/something').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush('unauthorized', UNAUTHORIZED);

    expect(error).toBeTruthy();
    expect(auth.session()).toBeNull();
    expect(auth.activeBox()).toBeNull();
    expect(localStorage.getItem('bh_active_box')).toBeNull();
  });
});
