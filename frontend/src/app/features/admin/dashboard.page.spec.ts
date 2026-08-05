import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard.page';
import { AuthService } from '../../core/auth/auth.service';

const STATS = { activeMembers: 3, weekAttendance: { checkins: 1, booked: 2, capacity: 10, fillPct: 20 }, expiringPlans: 0 };

describe('DashboardPage', () => {
  let http: HttpTestingController;

  function setup(boxStatus: string) {
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'BOX_ADMIN', boxStatus }],
    });
    auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'BOX_ADMIN' });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    http.expectOne('/api/box/admin-stats').flush(STATS);
    return fixture;
  }

  afterEach(() => http.verify());

  it('PENDING box with no class templates: shows the setup guide with both steps todo and step 3 locked', () => {
    const fixture = setup('PENDING');
    http.expectOne('/api/box/class-templates').flush([]);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.showSetupGuide()).toBeTrue();
    expect(cmp.step1Done()).toBeFalse();
    expect(cmp.step2Done()).toBeFalse();
    expect(cmp.boxActive()).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('unlocks on approval');
  });

  it('ACTIVE box with zero class templates: shows the setup guide, step 3 unlocked', () => {
    const fixture = setup('ACTIVE');
    http.expectOne('/api/box/class-templates').flush([]);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.showSetupGuide()).toBeTrue();
    expect(cmp.step1Done()).toBeFalse();
    expect(cmp.boxActive()).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('unlocks on approval');
  });

  it('ACTIVE box whose class-templates fetch errors: guide still renders with an error + retry', () => {
    const fixture = setup('ACTIVE');
    http.expectOne('/api/box/class-templates').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.showSetupGuide()).toBeTrue();
    expect(cmp.setupState()).toBe('error');
    const guide = fixture.nativeElement.querySelector('[data-testid="setup-guide"]');
    expect(guide).not.toBeNull();
    expect(guide.textContent).toContain("Couldn't load setup status.");
    const retry = guide.querySelector('button.retry');
    expect(retry).not.toBeNull();
    expect(retry.textContent).toContain('Try again');
  });

  it('ACTIVE box with existing class templates: setup guide is absent', () => {
    const fixture = setup('ACTIVE');
    http.expectOne('/api/box/class-templates').flush([
      { id: 't1', name: 'CrossFit', weekday: 1, startTime: '09:00:00', durationMin: 60, capacity: 12, coachId: null, active: true },
    ]);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.step1Done()).toBeTrue();
    expect(cmp.step2Done()).toBeTrue();
    expect(cmp.showSetupGuide()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[data-testid="setup-guide"]')).toBeNull();
  });
});
