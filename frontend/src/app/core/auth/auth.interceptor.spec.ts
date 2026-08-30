import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService, SILENT_401 } from './auth.service';

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
const NO_CONTENT = { status: 204, statusText: 'No Content' };
const STALE = { status: 409, statusText: 'Conflict' };
const FORBIDDEN = { status: 403, statusText: 'Forbidden' };
const membership = { boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE' as const, boxStatus: 'ACTIVE' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
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
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
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
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });

    let result: unknown;
    http.get('/api/box/something').subscribe(r => (result = r));

    httpMock.expectOne('/api/box/something').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);
    httpMock.expectNone('/api/auth/box-token');

    httpMock.expectOne('/api/box/something').flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('gives up cleanly when the box-token re-mint fails', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let error: unknown;
    http.get('/api/box/something').subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/box/something').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);
    httpMock.expectOne('/api/auth/box-token').flush('unauthorized', UNAUTHORIZED);

    expect(error).toBeTruthy();
    expect(auth.session()).toBeNull();
  });

  it('refreshes and retries a 401 from GET /api/me — a wrong body password is 422, never 401, so any 401 here is a dead session', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });

    let result: unknown;
    http.get('/api/me').subscribe(r => (result = r));

    httpMock.expectOne('/api/me').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);
    httpMock.expectOne('/api/me').flush({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });

    expect(result).toEqual({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
  });

  it('refreshes and retries a 401 from GET /api/auth/sessions — it lives under /api/auth only because bh_rt is Path=/api/auth, but it is authenticated and must not be treated as a non-refreshable lifecycle call', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });

    let result: unknown;
    http.get('/api/auth/sessions').subscribe(r => (result = r));

    httpMock.expectOne('/api/auth/sessions').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush(null, NO_CONTENT);
    httpMock.expectOne('/api/auth/sessions').flush([{ id: 's1', device: 'x', ip: '1.2.3.4', lastSeen: null, current: true }]);

    expect(result).toEqual([{ id: 's1', device: 'x', ip: '1.2.3.4', lastSeen: null, current: true }]);
  });

  it('does NOT refresh a 401 from /api/auth/refresh or /api/auth/box-token — those would recurse', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });

    let error: unknown;
    http.post('/api/auth/box-token', { boxId: '1' }).subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/auth/box-token').flush('unauthorized', UNAUTHORIZED);
    // no second /api/auth/refresh request — the exclusion holds for loop-prone endpoints
    httpMock.expectNone('/api/auth/refresh');

    expect(error).toBeTruthy();
  });

  it('clears session, activeBox, and localStorage when the refresh itself fails', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
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

  it('a SILENT_401 request clears the session but does not bounce to /auth/login', () => {
    // bootstrap()'s GET /api/me runs on public pages too (signup, forgot, verify, join). A 401
    // there just means "anonymous" — redirecting would boot the visitor off the page they asked
    // for. The refresh is still attempted; only the navigate is suppressed.
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate');

    let error: unknown;
    http.get('/api/me', { context: new HttpContext().set(SILENT_401, true) })
      .subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/me').flush('unauthorized', UNAUTHORIZED);
    httpMock.expectOne('/api/auth/refresh').flush('unauthorized', UNAUTHORIZED);

    expect(error).toBeTruthy();
    expect(auth.session()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('sends the active box as X-Box-Id on /api/box/** only', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    http.get('/api/box/something').subscribe();
    const boxReq = httpMock.expectOne('/api/box/something');
    expect(boxReq.request.headers.get('X-Box-Id')).toBe('1');
    boxReq.flush({});

    http.get('/api/me').subscribe();
    const meReq = httpMock.expectOne('/api/me');
    expect(meReq.request.headers.has('X-Box-Id')).toBeFalse();
    meReq.flush({});
  });

  it('re-mints and retries once when the server says the box is stale', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let result: unknown;
    http.get('/api/box/something').subscribe(r => (result = r));

    httpMock.expectOne('/api/box/something').flush({ detail: 'STALE_BOX' }, STALE);

    const remint = httpMock.expectOne('/api/auth/box-token');
    expect(remint.request.body).toEqual({ boxId: '1' });
    remint.flush(null, NO_CONTENT);

    httpMock.expectOne('/api/box/something').flush({ ok: true });
    expect(result).toEqual({ ok: true });
  });

  it('gives up after one stale retry instead of looping', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let error: unknown;
    http.get('/api/box/something').subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/box/something').flush({ detail: 'STALE_BOX' }, STALE);
    httpMock.expectOne('/api/auth/box-token').flush(null, NO_CONTENT);
    httpMock.expectOne('/api/box/something').flush({ detail: 'STALE_BOX' }, STALE);

    expect(error).toBeTruthy();
  });

  // The bug this guards: an expired box token answers 403, not 401, because bh_at is still valid
  // so the caller is authenticated but unscoped. The refresh-and-re-mint path is keyed on 401 and
  // never fired, so every /api/box/** call failed permanently 15 minutes after picking a gym and
  // every screen showed "Couldn't load". Reproduced live: /api/me 200 while
  // /api/box/conversations 403, and /api/auth/refresh returned 200 without fixing it.
  // Mutation caught: deleting the 403 branch in the interceptor.
  it('re-mints and retries once when a box-scoped call 403s with a box active — an expired box token is a 403, not a 401', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let result: unknown;
    http.get('/api/box/conversations').subscribe(r => (result = r));

    httpMock.expectOne('/api/box/conversations').flush(null, FORBIDDEN);

    const remint = httpMock.expectOne('/api/auth/box-token');
    expect(remint.request.body).toEqual({ boxId: '1' });
    remint.flush(null, NO_CONTENT);

    httpMock.expectOne('/api/box/conversations').flush({ ok: true });
    expect(result).toEqual({ ok: true });
    // No refresh: the user session was never in doubt, only the box scope.
    httpMock.expectNone('/api/auth/refresh');
  });

  // Mutation caught: retrying more than once, or re-entering the interceptor on the retry.
  it('surfaces a genuine 403 after one re-mint instead of looping', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let error: unknown;
    // An athlete addressing another athlete: forbidden by the rule, not by a stale token.
    http.get('/api/box/conversations/other-athlete').subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/box/conversations/other-athlete').flush(null, FORBIDDEN);
    httpMock.expectOne('/api/auth/box-token').flush(null, NO_CONTENT);
    httpMock.expectOne('/api/box/conversations/other-athlete').flush(null, FORBIDDEN);

    expect(error).toBeTruthy();
  });

  // Mutation caught: dropping the boxScoped/activeBox guards and re-minting on every 403.
  it('leaves a 403 outside /api/box/** alone, and one with no active box', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });

    let error: unknown;
    http.get('/api/me/something').subscribe({ error: e => (error = e) });
    httpMock.expectOne('/api/me/something').flush(null, FORBIDDEN);
    httpMock.expectNone('/api/auth/box-token');
    expect(error).toBeTruthy();

    // box-scoped, but no box has been selected — there is nothing to re-mint.
    let error2: unknown;
    http.get('/api/box/something').subscribe({ error: e => (error2 = e) });
    httpMock.expectOne('/api/box/something').flush(null, FORBIDDEN);
    httpMock.expectNone('/api/auth/box-token');
    expect(error2).toBeTruthy();
  });

  it('leaves an unrelated 409 alone', () => {
    auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

    let error: unknown;
    http.post('/api/box/sessions/1/book', {}).subscribe({ error: e => (error = e) });

    httpMock.expectOne('/api/box/sessions/1/book').flush({ detail: 'SESSION_FULL' }, STALE);
    httpMock.expectNone('/api/auth/box-token');

    expect(error).toBeTruthy();
  });
});
