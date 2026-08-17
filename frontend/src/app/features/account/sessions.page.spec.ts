import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AccountSession } from '../../core/auth/auth.service';
import { SessionsPage } from './sessions.page';

describe('SessionsPage', () => {
  let http: HttpTestingController;

  function setup(sessions?: AccountSession[]): ComponentFixture<SessionsPage> {
    TestBed.configureTestingModule({
      imports: [SessionsPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SessionsPage);
    fixture.detectChanges();
    if (sessions) {
      http.expectOne('/api/auth/sessions').flush(sessions);
      fixture.detectChanges();
    }
    return fixture;
  }

  afterEach(() => http.verify());

  it('marks only the row being revoked, and leaves it focusable', () => {
    const fixture = setup([
      { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: false },
      { id: 's2', device: 'iPhone', ip: '2.2.2.2', lastSeen: new Date().toISOString(), current: false },
    ]);
    const cmp = fixture.componentInstance;
    cmp.revoke({ id: 's1' } as AccountSession);
    fixture.detectChanges();

    const row1: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="signout-one-s1"]');
    const row2: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="signout-one-s2"]');
    expect(row1.getAttribute('aria-disabled')).toBe('true');
    expect(row1.disabled).withContext('a native disabled drops focus to <body>').toBeFalse();
    // NEGATIVE CONTROL (brief step 3): keying `revokingId` per row id is what makes this pass. A
    // single shared boolean (`pending = signal(false)` instead of `signal<string | null>(null)`)
    // would mark row2 disabled too, since it can't tell rows apart — confirmed by making that swap
    // and watching this assertion fail, then reverting.
    expect(row2.getAttribute('aria-disabled')).withContext('one boolean would disable every row').toBeNull();

    // Drain the in-flight DELETE and the reload it triggers so afterEach's http.verify() is clean.
    http.expectOne('/api/auth/sessions/s1').flush(null);
    http.expectOne('/api/auth/sessions').flush([]);
  });

  it('loading, error and empty each render their own testid', () => {
    // loading: before the initial GET resolves.
    const fixture = setup();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-loading"]')).toBeTruthy();

    // error.
    http.expectOne('/api/auth/sessions').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-error"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-loading"]')).toBeNull();

    // retry re-triggers the load and clears the error state.
    const retry: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sessions-retry"]');
    retry.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-loading"]')).toBeTruthy();

    // empty.
    http.expectOne('/api/auth/sessions').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-empty"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-list"]')).toBeNull();
  });

  it('revoking a non-current row clears its pending state and reloads the list', () => {
    const fixture = setup([
      { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: false },
    ]);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    fixture.componentInstance.revoke({ id: 's1', current: false } as AccountSession);
    http.expectOne('/api/auth/sessions/s1').flush(null);
    http.expectOne('/api/auth/sessions').flush([]);
    fixture.detectChanges();

    expect(fixture.componentInstance.revokingId()).toBeNull();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('revoking the current row clears auth state and navigates to login instead of reloading', () => {
    const fixture = setup([
      { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: true },
    ]);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    fixture.componentInstance.revoke({ id: 's1', current: true } as AccountSession);
    http.expectOne('/api/auth/sessions/s1').flush(null);
    // No second GET /api/auth/sessions — ending your own session means there's no page left to
    // refresh; http.verify() in afterEach would fail if one leaked out.

    expect(navSpy).toHaveBeenCalledWith(['/auth/login']);
  });

  it('a row revoke failure surfaces a row-scoped error and re-enables the row', () => {
    const fixture = setup([
      { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: false },
    ]);
    fixture.componentInstance.revoke({ id: 's1', current: false } as AccountSession);
    http.expectOne('/api/auth/sessions/s1').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.revokingId()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="sessions-row-error"]')).toBeTruthy();
  });

  it('sign out everywhere navigates to login on success, and issues no second request while pending', () => {
    const fixture = setup([
      { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: false },
    ]);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    const cmp = fixture.componentInstance;

    cmp.signOutEverywhere();
    cmp.signOutEverywhere();
    http.expectOne('/api/auth/logout-all').flush(null);

    expect(navSpy).toHaveBeenCalledWith(['/auth/login']);
  });

  it('sign out everywhere failure re-enables the button and shows its own error', () => {
    const fixture = setup([
      { id: 's1', device: 'Mac', ip: '1.1.1.1', lastSeen: new Date().toISOString(), current: false },
    ]);
    fixture.componentInstance.signOutEverywhere();
    http.expectOne('/api/auth/logout-all').error(new ProgressEvent('error'));
    fixture.detectChanges();

    expect(fixture.componentInstance.signOutPending()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[data-testid="signout-error"]')).toBeTruthy();
  });
});
