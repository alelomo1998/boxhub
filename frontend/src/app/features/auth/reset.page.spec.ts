import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { ResetPage } from './reset.page';

describe('ResetPage', () => {
  let http: HttpTestingController;
  let router: Router;

  function setup(token: string | null = 'tok-1') {
    TestBed.configureTestingModule({
      imports: [ResetPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => token } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    return TestBed.createComponent(ResetPage);
  }

  /** Fills the real <input> and dispatches a real 'submit' event on the real <form> — a spec that
   *  calls submit() directly can't see a dead form binding, which is exactly how login shipped a
   *  form doing a native GET with the password in the URL. */
  function submitViaDom(fixture: ComponentFixture<ResetPage>, password: string): Event {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="reset-password"]');
    input.value = password;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="reset-form"]');
    const event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  // Flushes the /api/auth/password/reset -> bootstrap (/api/auth/csrf, /api/me) chain that
  // AuthService.resetPassword's success path runs, handing back the given memberships.
  function flushResetSuccess(memberships: unknown[]) {
    http.expectOne('/api/auth/password/reset').flush(null);
    http.expectOne('/api/auth/csrf').flush({});
    tick();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'a@b.io', name: 'A', superadmin: false, memberships });
    tick();
  }

  afterEach(() => http.verify());

  it('treats a missing token as already expired, with no request ever issued', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.expired()).toBeTrue();
    http.expectNone('/api/auth/password/reset');
  });

  it('shows an expired state on a 410', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'a-new-password');
    http.expectOne('/api/auth/password/reset').flush('gone', { status: 410, statusText: 'Gone' });

    expect(fixture.componentInstance.expired()).toBeTrue();
  });

  it('submits via the real DOM submit event and prevents the native default', fakeAsync(() => {
    // NEGATIVE CONTROL: renamed the template's (submit) binding to the forbidden ngSubmit output
    // (which FormsModule no longer supplies) and reran — this spec failed, no request ever fired
    // and event.defaultPrevented stayed false. Reverted after confirming. This is exactly how
    // login shipped a form that put the password in the URL.
    const fixture = setup();
    fixture.detectChanges();
    spyOn(router, 'navigateByUrl');
    const event = submitViaDom(fixture, 'a-new-password');
    expect(event.defaultPrevented).toBeTrue();
    flushResetSuccess([]);
  }));

  it('rejects an empty password client-side and never issues a request', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, '');
    expect(fixture.nativeElement.querySelector('[data-testid="reset-password-error"]')).toBeTruthy();
    http.expectNone('/api/auth/password/reset');
  });

  it('rejects a 9-character password client-side and never issues a request', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, '123456789');
    expect(fixture.nativeElement.querySelector('[data-testid="reset-password-error"]')).toBeTruthy();
    http.expectNone('/api/auth/password/reset');
  });

  it('ignores a second submit while one is already pending', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    spyOn(router, 'navigateByUrl');
    submitViaDom(fixture, 'a-new-password');
    submitViaDom(fixture, 'a-new-password');
    // expectOne throws if more than one request matched — that's the assertion.
    flushResetSuccess([]);
    // expect().nothing() only stops Jasmine reporting "has no expectations", which would
    // otherwise be permanent noise in every run.
    expect().nothing();
  }));

  it('PASSWORD_TOO_SHORT lands on the field — the shared mapping, same sentence as signup', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'a-new-password');
    http.expectOne('/api/auth/password/reset').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.passwordError()).toBe('Use at least 10 characters.');
    expect(fixture.componentInstance.formError()).toBe('');
  });

  it('an unrecognised code lands on the form-level alert, not the field', () => {
    const fixture = setup();
    fixture.detectChanges();
    submitViaDom(fixture, 'a-new-password');
    http.expectOne('/api/auth/password/reset').flush({ detail: 'SOMETHING_WEIRD' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.passwordError()).toBe('');
    expect(fixture.componentInstance.formError()).toBeTruthy();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="reset-error"]')).toBeTruthy();
  });

  it('shows the sign-out-everywhere disclosure in the form branch', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('signs you out on all your other devices');
  });

  describe('auto-select on a single membership (same fix as verify/login)', () => {
    // NEGATIVE CONTROL for this describe block: temporarily changed the source's
    // `memberships.length === 1` to `=== 99` and reran — both tests below failed
    // (navigateByUrl was never called with the role route / box-token was never requested).
    // Reverted after confirming.

    it('one membership selects the box and lands on its role route', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      spyOn(router, 'navigateByUrl');
      submitViaDom(fixture, 'a-new-password');

      flushResetSuccess([{ boxId: 'box-1', boxName: 'Box', boxSlug: 'box', role: 'COACH', boxStatus: 'ACTIVE' }]);

      http.expectOne('/api/auth/box-token').flush(null);
      tick();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/coach');
    }));

    it('the box-token 403 arm (SUSPENDED/REJECTED box) surfaces an error instead of stranding the user', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      spyOn(router, 'navigateByUrl');
      submitViaDom(fixture, 'a-new-password');

      flushResetSuccess([{ boxId: 'box-1', boxName: 'Box', boxSlug: 'box', role: 'BOX_ADMIN', boxStatus: 'SUSPENDED' }]);

      http.expectOne('/api/auth/box-token').flush('forbidden', { status: 403, statusText: 'Forbidden' });
      tick();

      expect(router.navigateByUrl).not.toHaveBeenCalled();
      // Its own branch, not a danger alert inside the still-visible form: the password WAS
      // changed. Left in the form it read as "your reset failed" under a "New password"
      // heading, and invited a retry whose token is already spent — which would 410 and show
      // "Expired", turning a success into an apparent total failure.
      expect(fixture.componentInstance.boxUnavailable()).toBeTrue();

      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="reset-box-unavailable"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="reset-form"]'))
        .withContext('the spent form must be gone, or the user retries into a 410').toBeNull();
      expect(el.textContent).withContext('must say the password was changed').toContain('Password changed');
    }));

    it('several memberships still go to /gyms, unselected', fakeAsync(() => {
      const fixture = setup();
      fixture.detectChanges();
      spyOn(router, 'navigateByUrl');
      submitViaDom(fixture, 'a-new-password');

      flushResetSuccess([
        { boxId: 'box-1', boxName: 'Box 1', boxSlug: 'box-1', role: 'ATHLETE', boxStatus: 'ACTIVE' },
        { boxId: 'box-2', boxName: 'Box 2', boxSlug: 'box-2', role: 'COACH', boxStatus: 'ACTIVE' },
      ]);

      // No box-token request should ever be made — http.verify() in afterEach would fail this
      // test if one were left pending.
      expect(router.navigateByUrl).toHaveBeenCalledWith('/gyms');
    }));
  });
});
