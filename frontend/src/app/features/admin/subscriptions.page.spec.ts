import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SubscriptionsPage } from './subscriptions.page';

const MEMBER = { membershipId: 'm1', userId: 'u1', name: 'Anna', email: 'anna@a.io',
  role: 'ATHLETE', status: 'ACTIVE', planId: null, planName: null, subscriptionId: null,
  expiresAt: null, expiringSoon: false };
const MEMBER_WITH_PLAN = { membershipId: 'm2', userId: 'u2', name: 'Ben', email: 'ben@a.io',
  role: 'ATHLETE', status: 'ACTIVE', planId: 'p1', planName: 'Unlimited', subscriptionId: 'sub1',
  expiresAt: null, expiringSoon: false };
const PLAN = { id: 'p1', name: 'Unlimited', durationDays: 30, weeklyClassLimit: null, archived: false,
  priceCents: 8900, currency: 'eur', entitlement: 'UNLIMITED' };

describe('SubscriptionsPage', () => {
  let http: HttpTestingController;

  function setup(members: unknown[] = [MEMBER]) {
    TestBed.configureTestingModule({
      imports: [SubscriptionsPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SubscriptionsPage);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/box/members').flush({ content: members, totalElements: members.length, totalPages: 1 });
    http.expectOne('/api/box/plans').flush([PLAN]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('picking a plan pre-fills the agreed price from the plan list price', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.onPlanChange('p1');
    expect(cmp.priceInput).toBe(89);
  });

  it('record() sends priceCents in cents, converted from the editable euro input', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    cmp.onPlanChange('p1');
    cmp.priceInput = 70; // agreed discount below the €89 list price
    cmp.record();
    const req = http.expectOne('/api/box/subscriptions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ membershipId: 'm1', planId: 'p1', method: 'CASH', priceCents: 7000, priceNote: undefined });
    req.flush({ id: 's1', membershipId: 'm1', planId: 'p1', status: 'ACTIVE', priceCents: 7000, priceNote: null,
      currentPeriodStart: '2026-01-01T00:00:00Z', currentPeriodEnd: '2026-02-01T00:00:00Z', paymentId: 'pay1' });
    // record() re-runs the member search to refresh planName
    http.expectOne(r => r.url === '/api/box/members').flush({ content: [MEMBER], totalElements: 1, totalPages: 1 });
    expect(cmp.lastRecorded()?.discountCents).toBe(1900); // 8900 - 7000
  });

  it('a blank agreed price does not submit — no POST fires', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    cmp.selectedPlanId = 'p1';
    cmp.priceInput = null;
    cmp.record();
    expect(cmp.saveState()).toBe('idle'); // never moved to 'pending' — record() returned early
    http.expectNone('/api/box/subscriptions'); // guarded — a blank price must never coerce to €0
  });

  it('an explicit 0 IS a legitimate comp and does submit', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    cmp.selectedPlanId = 'p1';
    cmp.priceInput = 0;
    cmp.record();
    const req = http.expectOne('/api/box/subscriptions');
    expect(req.request.body).toEqual({ membershipId: 'm1', planId: 'p1', method: 'CASH', priceCents: 0, priceNote: undefined });
    req.flush({ id: 's1', membershipId: 'm1', planId: 'p1', status: 'ACTIVE', priceCents: 0, priceNote: null,
      currentPeriodStart: '2026-01-01T00:00:00Z', currentPeriodEnd: '2026-02-01T00:00:00Z', paymentId: 'pay2' });
    http.expectOne(r => r.url === '/api/box/members').flush({ content: [MEMBER], totalElements: 1, totalPages: 1 });
    expect(cmp.lastRecorded()?.sub.priceCents).toBe(0);
  });

  it('exposes a receipt link with the returned paymentId after a successful record', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    cmp.onPlanChange('p1');
    cmp.priceInput = 70;
    cmp.record();
    http.expectOne('/api/box/subscriptions').flush({ id: 's1', membershipId: 'm1', planId: 'p1', status: 'ACTIVE',
      priceCents: 7000, priceNote: null, currentPeriodStart: '2026-01-01T00:00:00Z',
      currentPeriodEnd: '2026-02-01T00:00:00Z', paymentId: 'pay-xyz' });
    http.expectOne(r => r.url === '/api/box/members').flush({ content: [MEMBER], totalElements: 1, totalPages: 1 });
    expect(cmp.lastRecorded()?.sub.paymentId).toBe('pay-xyz');
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[data-testid="rp-receipt-link"]');
    expect(link).not.toBeNull();
  });

  it('shows a discount preview when the agreed price is below list', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.onPlanChange('p1');
    cmp.priceInput = 50;
    expect(cmp.discountPreview()).toBe(3900);
    fixture.detectChanges();
    const preview = fixture.nativeElement.querySelector('[data-testid="rp-discount-preview"]');
    expect(preview).not.toBeNull();
  });

  it('no discount preview when the agreed price matches list', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.onPlanChange('p1');
    expect(cmp.discountPreview()).toBe(0);
  });

  it('maps INVALID_PRICE to friendly copy and preserves the entered price', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    cmp.onPlanChange('p1');
    cmp.priceInput = -5;
    cmp.record();
    http.expectOne('/api/box/subscriptions').flush({ detail: 'INVALID_PRICE' }, { status: 400, statusText: 'Bad Request' });
    expect(cmp.saveError()).toBe('Price cannot be negative.');
    expect(cmp.priceInput).toBe(-5); // input preserved on error
  });

  it('maps SWITCH_REQUIRES_CANCEL to copy naming the cause and pointing at the cancel control', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    cmp.onPlanChange('p1');
    cmp.priceInput = 89;
    cmp.record();
    http.expectOne('/api/box/subscriptions').flush({ detail: 'SWITCH_REQUIRES_CANCEL' }, { status: 409, statusText: 'Conflict' });
    expect(cmp.saveError()).toContain('cancel');
  });

  it('no cancel control for a member with no active plan', () => {
    const fixture = setup([MEMBER]);
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm1';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="rp-cancel"]')).toBeNull();
  });

  it('cancelPlan() calls the cancel endpoint for the selected member\'s subscription and refreshes the list', () => {
    const fixture = setup([MEMBER_WITH_PLAN]);
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm2';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="rp-cancel"]')).not.toBeNull();

    cmp.cancelPlan(MEMBER_WITH_PLAN as never);
    const req = http.expectOne('/api/box/subscriptions/sub1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    // onSearch() re-runs the member search to refresh planName/subscriptionId
    http.expectOne(r => r.url === '/api/box/members').flush({ content: [], totalElements: 0, totalPages: 0 });
    expect(cmp.cancelState()).toBe('idle');
  });

  it('a failed cancel shows an inline error', () => {
    const fixture = setup([MEMBER_WITH_PLAN]);
    const cmp = fixture.componentInstance;
    cmp.selectedMembershipId = 'm2';
    cmp.cancelPlan(MEMBER_WITH_PLAN as never);
    http.expectOne('/api/box/subscriptions/sub1').flush({}, { status: 500, statusText: 'Server Error' });
    expect(cmp.cancelState()).toBe('error');
    expect(cmp.cancelError()).toBeTruthy();
  });
});
