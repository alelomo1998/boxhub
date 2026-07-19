import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

const NO_CONTENT = { status: 204, statusText: 'No Content' };

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

  it('bootstrap sets the session from /api/me', fakeAsync(() => {
    service.bootstrap();
    http.expectOne('/api/auth/csrf').flush(null, NO_CONTENT);
    tick();
    http.expectOne('/api/me').flush({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE', boxStatus: 'ACTIVE' }],
    });
    tick();

    expect(service.session()?.email).toBe('a@b.io');
    expect(service.hasSession()).toBeTrue();
  }));

  it('bootstrap on a 401 leaves the session null and does not throw', fakeAsync(() => {
    service.bootstrap();
    http.expectOne('/api/auth/csrf').flush(null, NO_CONTENT);
    tick();
    http.expectOne('/api/me').flush('unauthenticated', { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(service.session()).toBeNull();
    expect(service.hasSession()).toBeFalse();
  }));

  it('login re-bootstraps and resolves the post-bootstrap session', fakeAsync(() => {
    let result: unknown;
    service.login('a@b.io', 'correct-horse-battery').subscribe(session => (result = session));

    http.expectOne('/api/auth/login').flush({
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE', boxStatus: 'ACTIVE' }],
    });
    http.expectOne('/api/auth/csrf').flush(null, NO_CONTENT);
    tick();
    http.expectOne('/api/me').flush({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE', boxStatus: 'ACTIVE' }],
    });
    tick();

    // the value the subscriber sees must already be post-bootstrap, not stale
    expect((result as { email: string } | null)?.email).toBe('a@b.io');
    expect(service.session()?.email).toBe('a@b.io');
  }));

  it('selectBox stores the active box', () => {
    service.session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'COACH', boxStatus: 'ACTIVE' }],
    });

    service.selectBox('1').subscribe();
    http.expectOne('/api/auth/box-token').flush(null, NO_CONTENT);

    expect(service.activeBox()?.boxId).toBe('1');
    expect(service.activeBox()?.role).toBe('COACH');
    expect(JSON.parse(localStorage.getItem('bh_active_box')!).boxId).toBe('1');
  });

  it('logout clears everything', () => {
    service.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [] });
    service.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });
    localStorage.setItem('bh_active_box', '{"boxId":"1"}');

    service.logout().subscribe();
    http.expectOne('/api/auth/logout').flush(null, NO_CONTENT);

    expect(service.session()).toBeNull();
    expect(service.activeBox()).toBeNull();
    expect(localStorage.getItem('bh_active_box')).toBeNull();
  });

  it('restoreActiveBox drops a saved box the user is no longer a member of', fakeAsync(() => {
    localStorage.setItem('bh_active_box', JSON.stringify({ boxId: 'gone', boxName: 'Old', role: 'ATHLETE' }));

    service.bootstrap();
    http.expectOne('/api/auth/csrf').flush(null, NO_CONTENT);
    tick();
    http.expectOne('/api/me').flush({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE', boxStatus: 'ACTIVE' }],
    });
    tick();

    expect(service.activeBox()).toBeNull();
    expect(localStorage.getItem('bh_active_box')).toBeNull();
  }));
});
