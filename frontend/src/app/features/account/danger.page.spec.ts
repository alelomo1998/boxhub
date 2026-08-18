import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { DangerPage } from './danger.page';
import { AuthService } from '../../core/auth/auth.service';

describe('DangerPage', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  function setup() {
    TestBed.configureTestingModule({
      imports: [DangerPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    const fixture = TestBed.createComponent(DangerPage);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  // THE SECURITY PROPERTY: the first delete submit sends no password. A 422 WRONG_PASSWORD coming
  // back is what reveals the field — that's how a Google-only account never sees one at all. This
  // is the single spec most likely to get "fixed" into sending the password eagerly; don't.
  it('sends NO password on the first attempt — that is what makes a Google-only account never see the field', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    const req = http.expectOne('/api/me');
    expect(req.request.body).withContext('a password here would break the Google-only path').toBeFalsy();
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
  });

  // NEGATIVE CONTROL (brief step 3): temporarily changed submitDelete() to call
  // `this.auth.deleteAccount('eager-negative-control')` unconditionally, sending a password body
  // on the first attempt. This spec (and "the second attempt...") then FAILED — confirming they
  // actually catch the mutation they're named for. Reverted after confirming.
  it('reveals the password field only after the server asks for it', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="delete-password"]')).not.toBeNull();
    expect(cmp.deleteError()).toBe('Enter your password to confirm.');
  });

  it('the second attempt does not tell the user to do the thing they just did', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(cmp.deleteError()).toBe('Enter your password to confirm.');

    // Field is now visible; the user types a (still wrong) password and retries.
    cmp.deletePassword.set('still-wrong');
    cmp.submitDelete();
    const req = http.expectOne('/api/me');
    expect(req.request.body).toEqual({ password: 'still-wrong' });
    req.flush({ detail: 'WRONG_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(cmp.deleteError()).toBe('That password is wrong.');
  });

  it('requires the literal string DELETE', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('delete');
    expect(cmp.canDelete()).toBeFalse();
    cmp.deleteConfirmText.set('DELETE');
    expect(cmp.canDelete()).toBeTrue();
  });

  // Fix-round regression: the opener used to be `<bh-button variant="ghost" class="opener">` with
  // `.opener { color: var(--danger); border-color: var(--danger); }` in THIS page's own
  // encapsulated styles — a rule that can only ever match the <bh-button> host tag, not the
  // <button> bh-button renders inside its own template. It computed to plain --hairline/--bone,
  // not --danger, and no prior spec caught it because none read actual computed style. This one
  // would fail against that old markup; it only passes because the opener now sets
  // `[dangerBorder]="true"`, a signal input bh-button's own template consumes.
  it('the delete opener actually renders danger-bordered, not just plain ghost', () => {
    const fixture = setup();
    const opener: HTMLElement = fixture.nativeElement.querySelector('[data-testid="delete-open"]');
    const style = getComputedStyle(opener);
    expect(style.borderColor).toBe('rgb(229, 72, 77)'); // --danger
    expect(style.color).toBe('rgb(229, 72, 77)');
  });

  it('a Google-only account deletes on the first attempt: no 422, no password field ever mounts', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="delete-password"]')).toBeNull();
    expect(navSpy).toHaveBeenCalledWith(['/auth/login']);
  });

  it('shows the box name on a 409 LAST_ADMIN', () => {
    const fixture = setup();
    auth.activeBox.set({ boxId: 'b1', boxName: 'Iron Box CrossFit', role: 'BOX_ADMIN' });
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'LAST_ADMIN' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.deleteError()).toBe(
      "You're the only admin of Iron Box CrossFit. Make someone else an admin before deleting your account.",
    );
  });

  it('falls back to a generic name when LAST_ADMIN fires with no active box', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'LAST_ADMIN' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.deleteError()).toBe(
      "You're the only admin of your box. Make someone else an admin before deleting your account.",
    );
  });

  it('an unrecognised error lands on the generic form-level alert', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'SOMETHING_WEIRD' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.deleteError()).toBe('Something went wrong — try again.');
  });

  it('a second submit while one is in flight issues no second request', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me');
    cmp.submitDelete();
    http.expectNone('/api/me');
  });

  it('opening the delete sheet resets stale state from a previous attempt', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.deleteConfirmText.set('DELETE');
    cmp.deletePassword.set('leftover');
    cmp.deleteNeedsPassword.set(true);
    cmp.deleteError.set('stale');

    cmp.openDelete();

    expect(cmp.deleteConfirmText()).toBe('');
    expect(cmp.deletePassword()).toBe('');
    expect(cmp.deleteNeedsPassword()).toBeFalse();
    expect(cmp.deleteError()).toBe('');
    expect(cmp.deleteOpen()).toBeTrue();
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

  it('shows an inline alert when export fails', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.downloadExport();
    http.expectOne('/api/me/export').flush({ detail: 'BOOM' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(cmp.exportError()).toBe("Couldn't export your data — try again.");
    expect(fixture.nativeElement.querySelector('[data-testid="export-error"]')).not.toBeNull();
  });

  // What Karma CAN see: the alert is the thing focus lands on, not that the timing is race-free —
  // fixture.detectChanges()'s synchronous flush can't prove that (see danger.page.ts's focusField
  // doc comment). The submit button natively disables under `deletePending()` (bh-button's
  // `[loading]` -> native `disabled`), which is what drops focus in the first place; this asserts
  // the recovery, not the drop. Mutation this catches: deleting the `focusField` calls in
  // submitDelete()'s error branch, or reverting `focusField` to `queueMicrotask`.
  it('moves focus onto the error alert after a delete fails, not <body>', fakeAsync(() => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.openDelete();
    fixture.detectChanges();
    cmp.deleteConfirmText.set('DELETE');
    cmp.submitDelete();
    http.expectOne('/api/me').flush({ detail: 'LAST_ADMIN' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="delete-error"]');
    expect(document.activeElement)
      .withContext('focus must move to the alert, not fall back to <body>')
      .toBe(alert);
  }));
});
