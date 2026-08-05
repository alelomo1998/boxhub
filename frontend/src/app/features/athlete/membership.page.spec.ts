import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MembershipPage } from './membership.page';

const PLAN_SUMMARY = { id: 'p1', name: 'Unlimited', priceCents: 8900, currency: 'eur',
  entitlement: 'UNLIMITED', weeklyClassLimit: null, durationDays: 30 };
const SUB = { id: 's1', membershipId: 'm1', planId: 'p1', status: 'ACTIVE', priceCents: 8900,
  priceNote: null, currentPeriodStart: '2026-01-01T00:00:00Z', currentPeriodEnd: '2026-02-01T00:00:00Z' };

describe('MembershipPage', () => {
  let http: HttpTestingController;

  function setup(mine: object) {
    TestBed.configureTestingModule({
      imports: [MembershipPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MembershipPage);
    fixture.detectChanges();
    http.expectOne('/api/box/me/subscription').flush(mine);
    http.expectOne('/api/box/plans').flush([PLAN_SUMMARY]);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('renders the active plan, price from cents, and period end', () => {
    const fixture = setup({ stripeAvailable: true, subscription: SUB, plan: PLAN_SUMMARY });
    const card = fixture.nativeElement.querySelector('[data-testid="current-plan"]');
    expect(card.textContent).toContain('Unlimited');
    expect(card.textContent).toContain('€89.00');
  });

  it('shows "no active plan" when the member has none', () => {
    const fixture = setup({ stripeAvailable: true, subscription: null, plan: null });
    expect(fixture.nativeElement.querySelector('[data-testid="no-plan"]')).not.toBeNull();
  });

  it('Subscribe is HIDDEN when the box has no Stripe connected', () => {
    const fixture = setup({ stripeAvailable: false, subscription: SUB, plan: PLAN_SUMMARY });
    expect(fixture.nativeElement.querySelector('[data-testid="subscribe-p1"]')).toBeNull();
  });

  it('Subscribe is SHOWN when stripeAvailable is true', () => {
    const fixture = setup({ stripeAvailable: true, subscription: null, plan: null });
    expect(fixture.nativeElement.querySelector('[data-testid="subscribe-p1"]')).not.toBeNull();
  });

  it('subscribe() posts the planId and redirects the browser to the returned URL', () => {
    const fixture = setup({ stripeAvailable: true, subscription: null, plan: null });
    const cmp = fixture.componentInstance;
    const redirectSpy = spyOn<any>(cmp, 'redirectTo');
    cmp.subscribe('p1');
    const req = http.expectOne('/api/box/subscriptions/checkout');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ planId: 'p1' });
    req.flush({ url: 'https://checkout.stripe.com/x' });
    expect(redirectSpy).toHaveBeenCalledWith('https://checkout.stripe.com/x');
  });

  it('maps SWITCH_REQUIRES_CANCEL to friendly copy', () => {
    const fixture = setup({ stripeAvailable: true, subscription: SUB, plan: PLAN_SUMMARY });
    const cmp = fixture.componentInstance;
    cmp.subscribe('p1');
    http.expectOne('/api/box/subscriptions/checkout').flush({ detail: 'SWITCH_REQUIRES_CANCEL' }, { status: 409, statusText: 'Conflict' });
    // Cancelling is BOX_ADMIN-only, so the athlete is pointed at their box rather than
    // at a control they don't have.
    expect(cmp.checkoutError()).toBe('Ask your box to cancel your current plan first.');
  });
});
