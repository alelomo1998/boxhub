import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MembersPage } from './members.page';

const WITH_PLAN = { membershipId: 'm1', userId: 'u1', name: 'Anna', email: 'anna@a.io',
  role: 'ATHLETE', status: 'ACTIVE', planId: 'p1', planName: 'Unlimited', subscriptionId: 'sub1',
  expiresAt: null, expiringSoon: false };
const NO_PLAN = { membershipId: 'm2', userId: 'u2', name: 'Ben', email: 'ben@a.io',
  role: 'ATHLETE', status: 'ACTIVE', planId: null, planName: null, subscriptionId: null,
  expiresAt: null, expiringSoon: false };

describe('MembersPage', () => {
  let http: HttpTestingController;

  function setup(members: unknown[]) {
    TestBed.configureTestingModule({
      imports: [MembersPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MembersPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/members')
      .flush({ content: members, totalElements: members.length, totalPages: 1 });
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows the plan name for a member with an active plan', () => {
    const fixture = setup([WITH_PLAN]);
    const row = fixture.nativeElement.querySelector('[data-testid="member-anna@a.io"]');
    expect(row.textContent).toContain('Unlimited');
    expect(row.querySelector('[data-testid="no-plan"]')).toBeNull();
  });

  it('shows an explicit "No active plan" link (not a bare —) for a member with none, pointing at recording a payment', () => {
    const fixture = setup([NO_PLAN]);
    const row = fixture.nativeElement.querySelector('[data-testid="member-ben@a.io"]');
    const link = row.querySelector('[data-testid="no-plan"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('No active plan');
    expect(link.getAttribute('href')).toBe('/admin/subscriptions');
  });
});
