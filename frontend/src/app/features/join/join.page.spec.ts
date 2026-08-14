import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { JoinPage } from './join.page';

describe('JoinPage', () => {
  let http: HttpTestingController;

  function setup(token: string | null = 'tok-1', loggedIn = false): ComponentFixture<JoinPage> {
    TestBed.configureTestingModule({
      imports: [JoinPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => token } } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    if (loggedIn) {
      TestBed.inject(AuthService).session.set(
        { id: 'u1', email: 'a@b.io', name: 'Ann', memberships: [], superadmin: false });
    }
    return TestBed.createComponent(JoinPage);
  }

  function flushPreview(opts: { boxName?: string; role?: string; planName?: string | null; email?: string } = {}) {
    http.expectOne('/api/invites/tok-1').flush({
      boxName: opts.boxName ?? 'Iron Box CrossFit', boxSlug: 'iron-box', role: opts.role ?? 'ATHLETE',
      email: opts.email ?? 'invitee@t.io', planName: opts.planName ?? null,
    });
  }

  afterEach(() => http.verify());

  it('preview loading: shows the loading indicator before the invite resolves, no form or accept button', () => {
    const fixture = setup();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="join-loading"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="join-form"]')).toBeNull();
    expect(el.querySelector('[data-testid="join-accept"]')).toBeNull();

    flushPreview();
  });

  it('preview success: prefills email and sets box name / role / plan', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview({ boxName: 'Iron Box CrossFit', role: 'COACH', planName: 'Starter', email: 'invitee@t.io' });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.email()).toBe('invitee@t.io');
    expect(cmp.boxName()).toBe('Iron Box CrossFit');
    expect(cmp.role()).toBe('COACH');
    expect(cmp.planName()).toBe('Starter');

    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Iron Box CrossFit');
    expect(text).toContain('Coach');
    expect(text).toContain('Starter');
  });

  it('preview failure: renders the invalid state and its back-to-login link, no form or loading indicator', () => {
    const fixture = setup();
    fixture.detectChanges();
    http.expectOne('/api/invites/tok-1').flush('bad token', { status: 410, statusText: 'Gone' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="join-invalid"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="join-invalid-back-to-login"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="join-form"]')).toBeNull();
    expect(el.querySelector('[data-testid="join-loading"]')).toBeNull();
  });

  it('logged-in: renders the accept button, not the form', () => {
    const fixture = setup('tok-1', true);
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="join-accept"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="join-form"]')).toBeNull();
  });

  it('logged-out: renders the form, not the accept button', () => {
    const fixture = setup('tok-1', false);
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="join-form"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="join-accept"]')).toBeNull();
  });

  it('clicking the submit button fires submit() and prevents the native GET-with-password-in-URL submit', fakeAsync(() => {
    // Regression for the P0 that shipped once on login: (ngSubmit) silently binds to nothing once
    // FormsModule/NgForm is gone, so a suite calling cmp.submit() directly — never dispatching a
    // real DOM event — stays green while the button is completely dead. This only proves something
    // by exercising the actual click-to-submit path and checking defaultPrevented.
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();
    // Real router, no configured routes — spy off the actual navigation so the chain's eventual
    // success doesn't throw NG04002 (no route matches '/athlete') and fail the test on a concern
    // this spec isn't about.
    spyOn(TestBed.inject(Router), 'navigateByUrl');

    const cmp = fixture.componentInstance;
    spyOn(cmp, 'submit').and.callThrough();
    cmp.name.set('Ann');
    cmp.password.set('whatever12');
    fixture.detectChanges();

    const form: HTMLFormElement = fixture.nativeElement.querySelector('[data-testid="join-form"]');
    let captured: Event | undefined;
    form.addEventListener('submit', e => (captured = e));
    const submitBtn: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
    submitBtn.click();

    expect(cmp.submit).withContext('the component handler must run').toHaveBeenCalled();
    expect(captured).withContext('a real submit event must reach the form').toBeDefined();
    expect(captured!.defaultPrevented)
      .withContext('preventDefault must fire, or the browser performs a native GET with the password in the URL')
      .toBeTrue();

    // Drain the four-stage chain so http.verify() in afterEach sees no stray requests.
    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'invitee@t.io', name: 'Ann', superadmin: false, memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { boxId: 'b1', boxName: 'Iron Box CrossFit', boxSlug: 'iron-box', role: 'ATHLETE', boxStatus: 'ACTIVE' });
    flushMicrotasks();
    http.expectOne('/api/auth/refresh').flush({});
    flushMicrotasks();
    http.expectOne('/api/auth/box-token').flush(null);
    flushMicrotasks();
  }));

  it('logged-out: pending is true while the chain is in flight, clears on error, typed values preserved', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.email.set('invitee@t.io'); cmp.password.set('short');
    cmp.submit();

    expect(cmp.pending()).toBeTrue();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.pending()).toBeFalse();
    expect(cmp.name()).toBe('Ann');
    expect(cmp.email()).toBe('invitee@t.io');
    expect(cmp.password()).toBe('short');
  });

  it('PASSWORD_TOO_SHORT lands on the password field, not the form-level alert', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.password.set('short');
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'PASSWORD_TOO_SHORT' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(cmp.passwordError()).toBe('Use at least 10 characters.');
    expect(cmp.formError()).toBe('');
    expect(fixture.nativeElement.querySelector('[data-testid="join-error"]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('PASSWORD_TOO_SHORT');
  });

  it('an unrecognised register-stage code shows the generic form alert, never the raw string', () => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/register').flush({ detail: 'SOMETHING_ODD' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(cmp.formError()).toBe('Something went wrong — try again.');
    expect(cmp.passwordError()).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('SOMETHING_ODD');
  });

  it('409 at the accept stage renders "already a member", never the raw backend string', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'invitee@t.io', name: 'Ann', superadmin: false, memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { detail: 'Already a member of this box' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();
    fixture.detectChanges();

    expect(cmp.formError()).toBe("You're already a member of this box.");
    // Case-sensitive: the raw server sentence starts with a capital "Already"; ours reads
    // "...already..." mid-sentence, so this only passes if the mapped copy replaced the raw text.
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Already a member of this box');
  }));

  it('410 at the accept stage renders the expired-mid-flow sentence, never the raw backend string', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'invitee@t.io', name: 'Ann', superadmin: false, memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { detail: 'Invite expired or already used' }, { status: 410, statusText: 'Gone' });
    flushMicrotasks();
    fixture.detectChanges();

    expect(cmp.formError()).toBe('This invite just expired or was already used.');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Invite expired or already used');
  }));

  it('403 at the selectBox stage renders the box-unavailable sentence', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'invitee@t.io', name: 'Ann', superadmin: false, memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { boxId: 'b1', boxName: 'Iron Box CrossFit', boxSlug: 'iron-box', role: 'ATHLETE', boxStatus: 'ACTIVE' });
    flushMicrotasks();
    http.expectOne('/api/auth/refresh').flush({});
    flushMicrotasks();
    http.expectOne('/api/auth/box-token').flush({ detail: 'BOX_SUSPENDED' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();
    fixture.detectChanges();

    expect(cmp.formError()).toBe('This box is unavailable — contact your box for help.');
  }));

  it('a successful register+login+accept navigates immediately, no confirmation screen', fakeAsync(() => {
    const fixture = setup();
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigateByUrl');

    const cmp = fixture.componentInstance;
    cmp.name.set('Ann'); cmp.password.set('whatever12');
    cmp.submit();
    http.expectOne('/api/auth/register').flush(null, { status: 201, statusText: 'Created' });
    http.expectOne('/api/auth/login').flush({ memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    flushMicrotasks();
    http.expectOne('/api/me').flush({ id: 'u1', email: 'invitee@t.io', name: 'Ann', superadmin: false, memberships: [] });
    flushMicrotasks();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { boxId: 'b1', boxName: 'Iron Box CrossFit', boxSlug: 'iron-box', role: 'COACH', boxStatus: 'ACTIVE' });
    flushMicrotasks();
    http.expectOne('/api/auth/refresh').flush({});
    flushMicrotasks();
    http.expectOne('/api/auth/box-token').flush(null);
    flushMicrotasks();

    expect(navSpy).toHaveBeenCalledWith('/coach');
  }));

  it('logged-in: accepting navigates immediately on success', fakeAsync(() => {
    const fixture = setup('tok-1', true);
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigateByUrl');

    fixture.componentInstance.acceptExisting();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { boxId: 'b1', boxName: 'Iron Box CrossFit', boxSlug: 'iron-box', role: 'BOX_ADMIN', boxStatus: 'ACTIVE' });
    flushMicrotasks();
    http.expectOne('/api/auth/refresh').flush({});
    flushMicrotasks();
    http.expectOne('/api/auth/box-token').flush(null);
    flushMicrotasks();

    expect(navSpy).toHaveBeenCalledWith('/admin');
  }));

  it('logged-in: pending clears on error and the shared 409 message renders', fakeAsync(() => {
    const fixture = setup('tok-1', true);
    fixture.detectChanges();
    flushPreview();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.acceptExisting();
    expect(cmp.pending()).toBeTrue();
    http.expectOne('/api/invites/tok-1/accept').flush(
      { detail: 'Already a member of this box' }, { status: 409, statusText: 'Conflict' });
    flushMicrotasks();

    expect(cmp.pending()).toBeFalse();
    expect(cmp.formError()).toBe("You're already a member of this box.");
  }));
});
