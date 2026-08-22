import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { InvitesPage } from './invites.page';
import { AuthService } from '../../core/auth/auth.service';
import { Plan } from './admin.service';

const PLAN = { id: 'p1', name: 'Unlimited', durationDays: 30, weeklyClassLimit: null, archived: false,
  priceCents: 8900, currency: 'eur', entitlement: 'UNLIMITED' } as Plan;

describe('InvitesPage', () => {
  let http: HttpTestingController;

  function setup(boxStatus: string, plans: Plan[] = []) {
    TestBed.configureTestingModule({
      imports: [InvitesPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    spyOn(auth, 'activeBoxStatus').and.returnValue(boxStatus);
    const fixture = TestBed.createComponent(InvitesPage);
    fixture.detectChanges();
    http.expectOne('/api/box/plans').flush(plans);
    http.expectOne('/api/box/invites').flush([]);
    return fixture;
  }

  afterEach(() => http.verify());

  it('PENDING box: shows the pending card, hides the create-invite form', () => {
    const fixture = setup('PENDING');
    const pending = fixture.nativeElement.querySelector('[data-testid="invites-pending"]');
    expect(pending).not.toBeNull();
    expect(pending.textContent).toContain('Available once your box is approved.');
    expect(fixture.nativeElement.querySelector('[data-testid="invite-create"]')).toBeNull();
  });

  it('ACTIVE box: hides the pending card, shows the create-invite form', () => {
    const fixture = setup('ACTIVE');
    expect(fixture.nativeElement.querySelector('[data-testid="invites-pending"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="invite-create"]')).not.toBeNull();
  });

  it('create() maps a 403 BOX_PENDING response to the pending-approval message', () => {
    const fixture = setup('ACTIVE');
    const cmp = fixture.componentInstance;
    cmp.email = 'member@email.com';
    cmp.create();
    http.expectOne('/api/box/invites').flush({ detail: 'BOX_PENDING' }, { status: 403, statusText: 'Forbidden' });
    expect(cmp.createError()).toBe('Available once your box is approved.');
  });

  it('a box with priced plans blocks create() until a plan is explicitly chosen — no silent unbookable invite', () => {
    const fixture = setup('ACTIVE', [PLAN]);
    const cmp = fixture.componentInstance;
    cmp.email = 'member@email.com';
    cmp.create(); // planId is still the undefined placeholder — nothing was explicitly chosen
    http.expectNone('/api/box/invites');
    // expectNone IS the assertion — it throws if a request matched. Jasmine does not count
    // HttpTestingController calls in its expect() tally, so without this the spec prints
    // "has no expectations" on every run and trains the reader to ignore Karma warnings.
    expect().nothing();
  });

  it('explicitly choosing "No plan (bill manually)" lets create() fire without a planId', () => {
    const fixture = setup('ACTIVE', [PLAN]);
    const cmp = fixture.componentInstance;
    cmp.email = 'member@email.com';
    cmp.planId = null; // the explicit "No plan (bill manually)" option
    cmp.create();
    const req = http.expectOne('/api/box/invites');
    expect(req.request.body.planId).toBeUndefined();
    req.flush({ id: 'i1', email: 'member@email.com', role: 'ATHLETE', planId: null,
      expiresAt: '2026-01-01T00:00:00Z', link: '/join/abc' });
    http.expectOne('/api/box/invites').flush([]); // load() refetch after create
  });

  it('choosing a real plan lets create() fire with that planId', () => {
    const fixture = setup('ACTIVE', [PLAN]);
    const cmp = fixture.componentInstance;
    cmp.email = 'member@email.com';
    cmp.planId = 'p1';
    cmp.create();
    const req = http.expectOne('/api/box/invites');
    expect(req.request.body.planId).toBe('p1');
    req.flush({ id: 'i1', email: 'member@email.com', role: 'ATHLETE', planId: 'p1',
      expiresAt: '2026-01-01T00:00:00Z', link: '/join/abc' });
    http.expectOne('/api/box/invites').flush([]);
  });

  it('a box with no plans yet does not force a choice (nothing to pick)', () => {
    const fixture = setup('ACTIVE', []);
    const cmp = fixture.componentInstance;
    cmp.email = 'member@email.com';
    cmp.create(); // planId still undefined, but plans() is empty — same as pre-M10 default
    const req = http.expectOne('/api/box/invites');
    expect(req.request.body.planId).toBeUndefined();
    req.flush({ id: 'i2', email: 'member@email.com', role: 'ATHLETE', planId: null,
      expiresAt: '2026-01-01T00:00:00Z', link: '/join/def' });
    http.expectOne('/api/box/invites').flush([]);
  });
});
