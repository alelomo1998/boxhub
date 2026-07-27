import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SecurityPage } from './security.page';
import { AuthService } from '../../core/auth/auth.service';

describe('SecurityPage', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  function setup() {
    TestBed.configureTestingModule({
      imports: [SecurityPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    const fixture = TestBed.createComponent(SecurityPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/sessions').flush([]); // initial sessions load from ngOnInit
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows Google-only guidance on a 409 NO_PASSWORD_SET from a password change, not a raw error', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.currentPassword = 'whatever';
    cmp.newPassword = 'a-new-password-1';
    cmp.changePassword();
    http.expectOne('/api/me/password').flush({ detail: 'NO_PASSWORD_SET' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.passwordGoogleOnly()).toBeTrue();
    expect(cmp.passwordError()).toBe('');
  });

  it('shows Google-only guidance on a 409 NO_PASSWORD_SET from an email change', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.newEmail = 'new@box.io';
    cmp.emailPassword = 'whatever';
    cmp.changeEmail();
    http.expectOne('/api/me/email').flush({ detail: 'NO_PASSWORD_SET' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.emailGoogleOnly()).toBeTrue();
  });

  it('shows "Current password is wrong" on a 422 WRONG_PASSWORD from a password change', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.currentPassword = 'not-it';
    cmp.newPassword = 'a-new-password-1';
    cmp.changePassword();
    http.expectOne('/api/me/password').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(cmp.passwordError()).toBe('Current password is wrong.');
    expect(cmp.passwordGoogleOnly()).toBeFalse();
  });

  it('shows "Current password is wrong" on a 422 WRONG_PASSWORD from an email change', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.newEmail = 'new@box.io';
    cmp.emailPassword = 'not-it';
    cmp.changeEmail();
    http.expectOne('/api/me/email').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(cmp.emailFormError()).toBe('Current password is wrong.');
  });

  it('shows an inline field error on 409 EMAIL_TAKEN, with the input preserved', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.newEmail = 'taken@box.io';
    cmp.emailPassword = 'secret123';
    cmp.changeEmail();
    http.expectOne('/api/me/email').flush({ detail: 'EMAIL_TAKEN' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.emailFieldError()).toBe('That address is already in use.');
    expect(cmp.newEmail).toBe('taken@box.io');
  });

  it('marks the caller\'s own session as "This device" via the current flag', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.loadSessions();
    http.expectOne('/api/auth/sessions').flush([
      { id: 's1', device: 'Chrome on Mac', ip: '1.2.3.4', lastSeen: '2026-07-17T10:00:00Z', current: true },
      { id: 's2', device: 'Safari on iPhone', ip: '5.6.7.8', lastSeen: '2026-07-16T10:00:00Z', current: false },
    ]);

    expect(cmp.sessionsState()).toBe('ready');
    expect(cmp.sessions().find(s => s.id === 's1')?.current).toBeTrue();
    expect(cmp.sessions().find(s => s.id === 's2')?.current).toBeFalse();
  });

  it('revokes ONE session by familyId and reloads the list — not logout-all', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.loadSessions();
    http.expectOne('/api/auth/sessions').flush([
      { id: 's1', device: 'Chrome on Mac', ip: '1.2.3.4', lastSeen: '2026-07-17T10:00:00Z', current: true },
      { id: 's2', device: 'Safari on iPhone', ip: '5.6.7.8', lastSeen: '2026-07-16T10:00:00Z', current: false },
    ]);

    cmp.revokeSession(cmp.sessions().find(s => s.id === 's2')!);
    // the targeted family only, and NOT /api/auth/logout-all — that distinction is the feature
    const req = http.expectOne('/api/auth/sessions/s2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    // a non-current row leaves the user signed in and just refreshes the list
    http.expectOne('/api/auth/sessions').flush([
      { id: 's1', device: 'Chrome on Mac', ip: '1.2.3.4', lastSeen: '2026-07-17T10:00:00Z', current: true },
    ]);
    expect(cmp.sessions().length).toBe(1);
    expect(cmp.revokingId()).toBeNull();
    expect(cmp.revokeError()).toBeNull();
  });

  it('shows an inline error and clears pending when a revoke fails', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.loadSessions();
    http.expectOne('/api/auth/sessions').flush([
      { id: 's2', device: 'Safari on iPhone', ip: '5.6.7.8', lastSeen: '2026-07-16T10:00:00Z', current: false },
    ]);

    cmp.revokeSession(cmp.sessions()[0]);
    http.expectOne('/api/auth/sessions/s2')
        .flush('nope', { status: 404, statusText: 'Not Found' });

    expect(cmp.revokeError()).toContain("Couldn't sign out that device");
    expect(cmp.revokingId()).toBeNull(); // pending must not stick, or the row stays disabled forever
  });

  it('shows an error state when sessions fail to load', () => {
    TestBed.configureTestingModule({
      imports: [SecurityPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SecurityPage);
    fixture.detectChanges();
    http.expectOne('/api/auth/sessions').flush('boom', { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.sessionsState()).toBe('error');
  });

  it('gates the delete button on typing DELETE exactly', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.openDelete();
    expect(cmp.canDelete()).toBeFalse();
    cmp.deleteConfirmText = 'delete';
    expect(cmp.canDelete()).toBeFalse();
    cmp.deleteConfirmText = 'DELETE';
    expect(cmp.canDelete()).toBeTrue();
  });

  it('reveals the password field on a 422 WRONG_PASSWORD (no password sent yet) and resends with it once gated', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.openDelete();
    cmp.deleteConfirmText = 'DELETE';
    cmp.submitDelete();
    const req1 = http.expectOne('/api/me');
    expect(req1.request.body).toBeNull();
    req1.flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(cmp.deleteNeedsPassword()).toBeTrue();
    expect(cmp.deleteError()).toBe('Enter your password to confirm.');
    expect(cmp.canDelete()).toBeFalse(); // still gated — no password typed yet

    cmp.deletePassword = 'secret123';
    expect(cmp.canDelete()).toBeTrue();
    cmp.submitDelete();
    const req2 = http.expectOne('/api/me');
    expect(req2.request.body).toEqual({ password: 'secret123' });
    req2.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('tells the user the password is wrong on a second failed attempt, not to re-enter it', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.openDelete();
    cmp.deleteConfirmText = 'DELETE';
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(cmp.deleteError()).toBe('Enter your password to confirm.');

    cmp.deletePassword = 'still-wrong';
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(cmp.deleteError()).toBe('That password is wrong.');
  });

  it('shows the box name on a 409 LAST_ADMIN', () => {
    const fixture = setup();
    auth.activeBox.set({ boxId: 'b1', boxName: 'Iron Box CrossFit', role: 'BOX_ADMIN' });
    const cmp = fixture.componentInstance;
    cmp.openDelete();
    cmp.deleteConfirmText = 'DELETE';
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'LAST_ADMIN' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.deleteError()).toBe(
      "You're the only admin of Iron Box CrossFit. Make someone else an admin before deleting your account.",
    );
  });

  it('downloads the export as a JSON blob', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    const createSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:mock');
    const revokeSpy = spyOn(URL, 'revokeObjectURL');
    const clickSpy = spyOn(HTMLAnchorElement.prototype, 'click');

    cmp.downloadExport();
    http.expectOne('/api/me/export').flush({ user: { email: 'a@b.io' } });

    expect(createSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
    expect(cmp.exportPending()).toBeFalse();
  });

  it('navigates to login after a successful delete', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    cmp.openDelete();
    cmp.deleteConfirmText = 'DELETE';
    cmp.submitDelete();
    http.expectOne('/api/me').flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });

    expect(navSpy).toHaveBeenCalledWith(['/auth/login']);
  });
});
